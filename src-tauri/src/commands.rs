//! フロントエンドから呼び出される Tauri コマンド。
//! ロジックは Tauri ランタイム非依存の関数に分離し、単体テスト可能にしている。

use std::path::{Path, PathBuf};

use image::RgbaImage;
use serde::{Deserialize, Serialize};

use crate::export::{encode, with_extension, ExportFormat, ExportOptions};
use crate::heic::{decode_heif, is_heif};
use crate::processing::{pixelate, reduce_colors, ColorMode};
use crate::transform::{crop, resize, CropRect, Size};

/// 変換オプション
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOptions {
    /// ドットの粗さ（ブロックの一辺のピクセル数）
    pub block_size: u32,
    /// 減色モード
    pub color_mode: ColorMode,
    /// 切り抜き範囲（元画像座標）。省略時は切り抜かない。
    #[serde(default)]
    pub crop: Option<CropRect>,
    /// 出力サイズ。省略時はリサイズしない。
    #[serde(default)]
    pub resize: Option<Size>,
}

/// 画像の基本情報
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
}

/// バイト列を RGBA 画像にデコードする
pub fn decode(data: &[u8]) -> Result<RgbaImage, String> {
    if is_heif(data) {
        return decode_heif(data);
    }
    image::load_from_memory(data)
        .map(|img| img.to_rgba8())
        .map_err(|e| format!("画像の読み込みに失敗しました: {e}"))
}

/// トリミング → リサイズ → ドット化 → 減色 の順に処理する
pub fn run_pipeline(img: &RgbaImage, options: ProcessOptions) -> Result<RgbaImage, String> {
    let cropped = match options.crop {
        Some(rect) => crop(img, rect)?,
        None => img.clone(),
    };
    let resized = match options.resize {
        Some(size) => resize(&cropped, size)?,
        None => cropped,
    };
    Ok(reduce_colors(&pixelate(&resized, options.block_size), options.color_mode))
}

/// 画像バイト列を処理し、プレビュー用の PNG バイト列で返す。
pub fn process_image_bytes(data: &[u8], options: ProcessOptions) -> Result<Vec<u8>, String> {
    let out = run_pipeline(&decode(data)?, options)?;
    Ok(encode(&out, ExportOptions { format: ExportFormat::Png, quality: 100 }))
}

/// 元画像を（向きを反映して）デコードし、表示用の PNG バイト列で返す。
pub fn preview_original_bytes(data: &[u8]) -> Result<Vec<u8>, String> {
    Ok(encode(&decode(data)?, ExportOptions { format: ExportFormat::Png, quality: 100 }))
}

/// 画像バイト列から幅・高さを取得する。
pub fn image_info_bytes(data: &[u8]) -> Result<ImageInfo, String> {
    let img = decode(data)?;
    Ok(ImageInfo { width: img.width(), height: img.height() })
}

/// 画像を処理して `path` に書き出す。拡張子は必要に応じて補い、実際の保存先を返す。
pub fn export_image_to(
    data: &[u8],
    options: ProcessOptions,
    export: ExportOptions,
    path: &Path,
) -> Result<PathBuf, String> {
    let out = run_pipeline(&decode(data)?, options)?;
    let target = with_extension(path, export.format);
    std::fs::write(&target, encode(&out, export))
        .map_err(|e| format!("保存に失敗しました ({}): {e}", target.display()))?;
    Ok(target)
}

#[tauri::command]
pub fn process_image(data: Vec<u8>, options: ProcessOptions) -> Result<Vec<u8>, String> {
    process_image_bytes(&data, options)
}

#[tauri::command]
pub fn preview_original(data: Vec<u8>) -> Result<Vec<u8>, String> {
    preview_original_bytes(&data)
}

#[tauri::command]
pub fn image_info(data: Vec<u8>) -> Result<ImageInfo, String> {
    image_info_bytes(&data)
}

#[tauri::command]
pub fn export_image(
    data: Vec<u8>,
    options: ProcessOptions,
    export: ExportOptions,
    path: String,
) -> Result<String, String> {
    export_image_to(&data, options, export, Path::new(&path)).map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, Rgba};
    use std::io::Cursor;

    fn encode_as(img: &RgbaImage, fmt: ImageFormat) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img.clone())
            .to_rgb8()
            .write_to(&mut buf, fmt)
            .unwrap();
        buf.into_inner()
    }

    fn png_of(img: &RgbaImage) -> Vec<u8> {
        encode_as(img, ImageFormat::Png)
    }

    fn opts(block_size: u32, color_mode: ColorMode) -> ProcessOptions {
        ProcessOptions { block_size, color_mode, crop: None, resize: None }
    }

    /// テストごとに一意な一時ディレクトリ
    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("dotmaker-test-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // ---------- decode / image_info ----------

    #[test]
    fn decode_accepts_jpeg_bmp_gif_tiff_png() {
        let img = RgbaImage::from_pixel(4, 3, Rgba([200, 100, 50, 255]));
        for fmt in [ImageFormat::Png, ImageFormat::Jpeg, ImageFormat::Bmp, ImageFormat::Gif, ImageFormat::Tiff] {
            let out = decode(&encode_as(&img, fmt));
            assert_eq!(out.map(|i| i.dimensions()), Ok((4, 3)), "{fmt:?}");
        }
    }

    #[test]
    fn decode_accepts_heic_with_orientation() {
        let sample = include_bytes!("../tests/fixtures/sample.heic");
        let rotated = include_bytes!("../tests/fixtures/rotated.heic");
        assert_eq!(decode(sample).map(|i| i.dimensions()), Ok((16, 8)));
        assert_eq!(image_info_bytes(rotated), Ok(ImageInfo { width: 8, height: 16 }));
        let png = process_image_bytes(sample, opts(4, ColorMode::Color16)).unwrap();
        assert_eq!(image::guess_format(&png).unwrap(), ImageFormat::Png);
    }

    #[test]
    fn decode_invalid_data_returns_error() {
        let err = decode(b"not an image").unwrap_err();
        assert!(err.contains("画像の読み込みに失敗"), "{err}");
    }

    #[test]
    fn image_info_returns_dimensions() {
        let img = RgbaImage::new(7, 5);
        assert_eq!(image_info_bytes(&png_of(&img)), Ok(ImageInfo { width: 7, height: 5 }));
        assert_eq!(image_info(png_of(&img)), Ok(ImageInfo { width: 7, height: 5 }));
        assert!(image_info_bytes(b"xx").is_err());
    }

    #[test]
    fn image_info_serializes_to_json() {
        let json = serde_json::to_string(&ImageInfo { width: 1, height: 2 }).unwrap();
        assert_eq!(json, r#"{"width":1,"height":2}"#);
    }

    #[test]
    fn preview_original_returns_unmodified_png() {
        let img = RgbaImage::from_fn(5, 3, |x, y| Rgba([x as u8 * 40, y as u8 * 80, 7, 255]));
        let out = preview_original_bytes(&png_of(&img)).unwrap();
        assert_eq!(image::load_from_memory(&out).unwrap().to_rgba8(), img);
        assert_eq!(preview_original(png_of(&img)), Ok(out));
        let heic = preview_original_bytes(include_bytes!("../tests/fixtures/rotated.heic")).unwrap();
        let decoded = image::load_from_memory(&heic).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (8, 16));
        assert!(preview_original_bytes(b"zz").is_err());
    }

    // ---------- run_pipeline ----------

    #[test]
    fn pipeline_pixelates_then_reduces_colors() {
        // 左が黒・右が白の 2x1 画像をブロック2で平均 → 灰(128) → 2階調で白(255)
        let mut img = RgbaImage::from_pixel(2, 1, Rgba([0, 0, 0, 255]));
        img.put_pixel(1, 0, Rgba([255, 255, 255, 255]));
        let out = run_pipeline(&img, opts(2, ColorMode::Gray2)).unwrap();
        assert!(out.pixels().all(|p| *p == Rgba([255, 255, 255, 255])));
    }

    #[test]
    fn pipeline_crops_before_resizing() {
        // 左半分赤・右半分青。右半分を切り抜いて 3x3 にリサイズ → 全部青
        let img = RgbaImage::from_fn(10, 4, |x, _| if x < 5 { Rgba([255, 0, 0, 255]) } else { Rgba([0, 0, 255, 255]) });
        let o = ProcessOptions {
            crop: Some(CropRect { x: 5, y: 0, width: 5, height: 4 }),
            resize: Some(Size { width: 3, height: 3 }),
            ..opts(1, ColorMode::Color4096)
        };
        let out = run_pipeline(&img, o).unwrap();
        assert_eq!(out.dimensions(), (3, 3));
        assert!(out.pixels().all(|p| *p == Rgba([0, 0, 255, 255])));
    }

    #[test]
    fn pipeline_pixelates_after_resizing() {
        // 4x1 にリサイズしてからブロック2 → 出力は2ブロック分の色に揃う
        let img = RgbaImage::from_fn(8, 1, |x, _| Rgba([(x * 30) as u8, 0, 0, 255]));
        let o = ProcessOptions { resize: Some(Size { width: 4, height: 1 }), ..opts(2, ColorMode::Gray256) };
        let out = run_pipeline(&img, o).unwrap();
        assert_eq!(out.dimensions(), (4, 1));
        assert_eq!(out.get_pixel(0, 0), out.get_pixel(1, 0));
        assert_eq!(out.get_pixel(2, 0), out.get_pixel(3, 0));
    }

    #[test]
    fn pipeline_propagates_crop_and_resize_errors() {
        let img = RgbaImage::new(4, 4);
        let bad_crop = ProcessOptions { crop: Some(CropRect { x: 3, y: 3, width: 5, height: 5 }), ..opts(1, ColorMode::Gray2) };
        assert!(run_pipeline(&img, bad_crop).unwrap_err().contains("切り抜き範囲"));
        let bad_resize = ProcessOptions { resize: Some(Size { width: 0, height: 1 }), ..opts(1, ColorMode::Gray2) };
        assert!(run_pipeline(&img, bad_resize).unwrap_err().contains("出力サイズ"));
    }

    // ---------- process_image ----------

    #[test]
    fn process_image_returns_png() {
        let img = RgbaImage::from_fn(10, 6, |x, y| Rgba([(x * 20) as u8, (y * 40) as u8, 0, 255]));
        let out = process_image_bytes(&png_of(&img), opts(3, ColorMode::Color256)).unwrap();
        assert_eq!(image::guess_format(&out).unwrap(), ImageFormat::Png);
        let decoded = image::load_from_memory(&out).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (10, 6));
        assert_eq!(process_image(png_of(&img), opts(3, ColorMode::Color256)), Ok(out));
    }

    #[test]
    fn process_image_reports_decode_error() {
        assert!(process_image_bytes(b"zz", opts(2, ColorMode::Gray2)).unwrap_err().contains("画像の読み込みに失敗"));
    }

    #[test]
    fn options_deserialize_from_camel_case_json() {
        let o: ProcessOptions = serde_json::from_str(r#"{"blockSize":8,"colorMode":"color16"}"#).unwrap();
        assert_eq!(o, opts(8, ColorMode::Color16));
        let o: ProcessOptions = serde_json::from_str(
            r#"{"blockSize":1,"colorMode":"gray2","crop":{"x":1,"y":2,"width":3,"height":4},"resize":{"width":5,"height":6}}"#,
        )
        .unwrap();
        assert_eq!(o.crop, Some(CropRect { x: 1, y: 2, width: 3, height: 4 }));
        assert_eq!(o.resize, Some(Size { width: 5, height: 6 }));
        let o: ProcessOptions = serde_json::from_str(r#"{"blockSize":1,"colorMode":"gray2","crop":null,"resize":null}"#).unwrap();
        assert_eq!(o, opts(1, ColorMode::Gray2));
    }

    // ---------- export ----------

    #[test]
    fn export_writes_png_file_and_returns_path_with_extension() {
        let dir = temp_dir("png");
        let img = RgbaImage::from_pixel(6, 4, Rgba([10, 200, 30, 255]));
        let export = ExportOptions { format: ExportFormat::Png, quality: 90 };
        let saved = export_image_to(&png_of(&img), opts(2, ColorMode::Color4096), export, &dir.join("out")).unwrap();
        assert_eq!(saved, dir.join("out.png"));
        let bytes = std::fs::read(&saved).unwrap();
        assert_eq!(image::guess_format(&bytes).unwrap(), ImageFormat::Png);
        assert_eq!(image::load_from_memory(&bytes).unwrap().width(), 6);
    }

    #[test]
    fn export_writes_jpeg_via_tauri_command() {
        let dir = temp_dir("jpeg");
        let img = RgbaImage::from_pixel(6, 4, Rgba([10, 200, 30, 255]));
        let export = ExportOptions { format: ExportFormat::Jpeg, quality: 80 };
        let target = dir.join("photo.jpeg");
        let saved = export_image(png_of(&img), opts(1, ColorMode::Color65536), export, target.to_string_lossy().into_owned()).unwrap();
        assert_eq!(PathBuf::from(&saved), target);
        assert_eq!(image::guess_format(&std::fs::read(&saved).unwrap()).unwrap(), ImageFormat::Jpeg);
    }

    #[test]
    fn export_reports_write_error() {
        let dir = temp_dir("err");
        let img = RgbaImage::new(2, 2);
        let export = ExportOptions { format: ExportFormat::Png, quality: 90 };
        let err = export_image_to(&png_of(&img), opts(1, ColorMode::Gray2), export, &dir.join("missing/dir/out.png")).unwrap_err();
        assert!(err.contains("保存に失敗"), "{err}");
    }

    #[test]
    fn export_reports_processing_error() {
        let export = ExportOptions { format: ExportFormat::Png, quality: 90 };
        assert!(export_image_to(b"zz", opts(1, ColorMode::Gray2), export, Path::new("/tmp/x.png")).is_err());
    }
}
