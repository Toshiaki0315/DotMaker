//! 画像の書き出し（エンコード・保存パス処理）

use std::path::{Path, PathBuf};

use image::RgbaImage;
use serde::Deserialize;

/// 出力フォーマット
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExportFormat {
    Png,
    Jpeg,
}

fn default_quality() -> u8 {
    90
}

/// 書き出しオプション
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct ExportOptions {
    pub format: ExportFormat,
    /// JPEG 品質 (1〜100)。PNG では無視される。
    #[serde(default = "default_quality")]
    pub quality: u8,
}

/// 指定フォーマットでエンコードする。JPEG は透明部分を白で合成する。
pub fn encode(img: &RgbaImage, opts: ExportOptions) -> Vec<u8> {
    let mut buf = Vec::new();
    match opts.format {
        ExportFormat::Png => {
            img.write_with_encoder(image::codecs::png::PngEncoder::new(&mut buf))
                .expect("in-memory PNG encoding of RGBA8 never fails");
        }
        ExportFormat::Jpeg => {
            let rgb = flatten_on_white(img);
            let quality = opts.quality.clamp(1, 100);
            rgb.write_with_encoder(image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality))
                .expect("in-memory JPEG encoding of RGB8 never fails");
        }
    }
    buf
}

/// アルファを白背景に合成して RGB にする
fn flatten_on_white(img: &RgbaImage) -> image::RgbImage {
    image::RgbImage::from_fn(img.width(), img.height(), |x, y| {
        let [r, g, b, a] = img.get_pixel(x, y).0;
        let a = u32::from(a);
        let blend = |c: u8| ((u32::from(c) * a + 255 * (255 - a) + 127) / 255) as u8;
        image::Rgb([blend(r), blend(g), blend(b)])
    })
}

/// パスの拡張子がフォーマットに合わなければ、正しい拡張子を末尾に付け足す。
pub fn with_extension(path: &Path, format: ExportFormat) -> PathBuf {
    let (accepted, default): (&[&str], &str) = match format {
        ExportFormat::Png => (&["png"], "png"),
        ExportFormat::Jpeg => (&["jpg", "jpeg"], "jpg"),
    };
    let ext = path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase);
    if ext.is_some_and(|e| accepted.contains(&e.as_str())) {
        return path.to_path_buf();
    }
    let mut s = path.as_os_str().to_os_string();
    s.push(".");
    s.push(default);
    PathBuf::from(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, Rgba};

    fn png() -> ExportOptions {
        ExportOptions { format: ExportFormat::Png, quality: 90 }
    }
    fn jpeg(quality: u8) -> ExportOptions {
        ExportOptions { format: ExportFormat::Jpeg, quality }
    }

    #[test]
    fn png_roundtrip_keeps_pixels_and_alpha() {
        let img = RgbaImage::from_fn(3, 2, |x, y| Rgba([x as u8 * 50, y as u8 * 90, 7, 100 + x as u8]));
        let bytes = encode(&img, png());
        assert_eq!(image::guess_format(&bytes).unwrap(), ImageFormat::Png);
        assert_eq!(image::load_from_memory(&bytes).unwrap().to_rgba8(), img);
    }

    #[test]
    fn jpeg_output_is_jpeg_with_same_size() {
        let img = RgbaImage::from_pixel(16, 8, Rgba([200, 30, 30, 255]));
        let bytes = encode(&img, jpeg(90));
        assert_eq!(image::guess_format(&bytes).unwrap(), ImageFormat::Jpeg);
        let decoded = image::load_from_memory(&bytes).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (16, 8));
    }

    #[test]
    fn jpeg_composites_transparent_pixels_on_white() {
        let img = RgbaImage::from_pixel(8, 8, Rgba([0, 0, 0, 0]));
        let decoded = image::load_from_memory(&encode(&img, jpeg(100))).unwrap().to_rgb8();
        assert!(decoded.pixels().all(|p| p.0.iter().all(|&c| c >= 250)), "{:?}", decoded.get_pixel(0, 0));
    }

    #[test]
    fn jpeg_quality_affects_size_and_is_clamped() {
        let img = RgbaImage::from_fn(64, 64, |x, y| Rgba([(x * 4) as u8, (y * 4) as u8, ((x ^ y) * 4) as u8, 255]));
        let low = encode(&img, jpeg(10)).len();
        let high = encode(&img, jpeg(100)).len();
        assert!(low < high, "low={low} high={high}");
        // 0 は 1 として扱われ、パニックしない
        assert_eq!(encode(&img, jpeg(0)), encode(&img, jpeg(1)));
    }

    #[test]
    fn options_deserialize_with_default_quality() {
        let o: ExportOptions = serde_json::from_str(r#"{"format":"jpeg"}"#).unwrap();
        assert_eq!(o, jpeg(90));
        let o: ExportOptions = serde_json::from_str(r#"{"format":"png","quality":50}"#).unwrap();
        assert_eq!(o, ExportOptions { format: ExportFormat::Png, quality: 50 });
    }

    #[test]
    fn with_extension_keeps_matching_extension_case_insensitively() {
        assert_eq!(with_extension(Path::new("/a/b.png"), ExportFormat::Png), PathBuf::from("/a/b.png"));
        assert_eq!(with_extension(Path::new("/a/b.PNG"), ExportFormat::Png), PathBuf::from("/a/b.PNG"));
        assert_eq!(with_extension(Path::new("b.jpg"), ExportFormat::Jpeg), PathBuf::from("b.jpg"));
        assert_eq!(with_extension(Path::new("b.JPEG"), ExportFormat::Jpeg), PathBuf::from("b.JPEG"));
    }

    #[test]
    fn with_extension_appends_when_missing_or_different() {
        assert_eq!(with_extension(Path::new("/a/b"), ExportFormat::Png), PathBuf::from("/a/b.png"));
        assert_eq!(with_extension(Path::new("/a/b.png"), ExportFormat::Jpeg), PathBuf::from("/a/b.png.jpg"));
        assert_eq!(with_extension(Path::new("my.photo"), ExportFormat::Png), PathBuf::from("my.photo.png"));
    }
}
