//! フロントエンドから呼び出される Tauri コマンド。
//! ロジックは Tauri ランタイム非依存の関数に分離し、単体テスト可能にしている。

use std::io::Cursor;

use image::ImageFormat;
use serde::Deserialize;

use crate::processing::{pixelate, reduce_colors, ColorMode};

/// 変換オプション
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessOptions {
    /// ドットの粗さ（ブロックの一辺のピクセル数）
    pub block_size: u32,
    /// 減色モード
    pub color_mode: ColorMode,
}

/// 画像バイト列をデコードし、ドット化・減色した結果を PNG バイト列で返す。
pub fn process_image_bytes(data: &[u8], options: ProcessOptions) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(data)
        .map_err(|e| format!("画像の読み込みに失敗しました: {e}"))?
        .to_rgba8();
    let out = reduce_colors(&pixelate(&img, options.block_size), options.color_mode);
    let mut buf = Cursor::new(Vec::new());
    out.write_to(&mut buf, ImageFormat::Png)
        .expect("in-memory PNG encoding of RGBA8 never fails");
    Ok(buf.into_inner())
}

#[tauri::command]
pub fn process_image(data: Vec<u8>, options: ProcessOptions) -> Result<Vec<u8>, String> {
    process_image_bytes(&data, options)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn encode(img: &RgbaImage, fmt: ImageFormat) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        image::DynamicImage::ImageRgba8(img.clone())
            .to_rgb8()
            .write_to(&mut buf, fmt)
            .unwrap();
        buf.into_inner()
    }

    fn opts(block_size: u32, color_mode: ColorMode) -> ProcessOptions {
        ProcessOptions { block_size, color_mode }
    }

    #[test]
    fn returns_png_with_same_dimensions() {
        let img = RgbaImage::from_fn(10, 6, |x, y| Rgba([(x * 20) as u8, (y * 40) as u8, 0, 255]));
        let out = process_image_bytes(&encode(&img, ImageFormat::Png), opts(3, ColorMode::Color256)).unwrap();
        assert_eq!(image::guess_format(&out).unwrap(), ImageFormat::Png);
        let decoded = image::load_from_memory(&out).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (10, 6));
    }

    #[test]
    fn applies_pixelate_then_color_reduction() {
        // 左が黒・右が白の 2x1 画像をブロック2で平均 → 灰(128) → 2階調で白(255)
        let mut img = RgbaImage::from_pixel(2, 1, Rgba([0, 0, 0, 255]));
        img.put_pixel(1, 0, Rgba([255, 255, 255, 255]));
        let out = process_image_bytes(&encode(&img, ImageFormat::Png), opts(2, ColorMode::Gray2)).unwrap();
        let decoded = image::load_from_memory(&out).unwrap().to_rgba8();
        assert_eq!(*decoded.get_pixel(0, 0), Rgba([255, 255, 255, 255]));
        assert_eq!(*decoded.get_pixel(1, 0), Rgba([255, 255, 255, 255]));
    }

    #[test]
    fn accepts_jpeg_bmp_gif_tiff_input() {
        let img = RgbaImage::from_pixel(4, 4, Rgba([200, 100, 50, 255]));
        for fmt in [ImageFormat::Jpeg, ImageFormat::Bmp, ImageFormat::Gif, ImageFormat::Tiff] {
            let out = process_image_bytes(&encode(&img, fmt), opts(2, ColorMode::Color4096));
            assert!(out.is_ok(), "{fmt:?}: {out:?}");
        }
    }

    #[test]
    fn invalid_data_returns_error() {
        let err = process_image_bytes(b"not an image", opts(2, ColorMode::Gray2)).unwrap_err();
        assert!(err.contains("画像の読み込みに失敗"), "{err}");
    }

    #[test]
    fn tauri_command_delegates() {
        let img = RgbaImage::from_pixel(2, 2, Rgba([1, 2, 3, 255]));
        let data = encode(&img, ImageFormat::Png);
        let opts = opts(1, ColorMode::Gray256);
        assert_eq!(process_image(data.clone(), opts), process_image_bytes(&data, opts));
    }

    #[test]
    fn options_deserialize_from_camel_case_json() {
        let o: ProcessOptions =
            serde_json::from_str(r#"{"blockSize":8,"colorMode":"color16"}"#).unwrap();
        assert_eq!(o, opts(8, ColorMode::Color16));
    }
}
