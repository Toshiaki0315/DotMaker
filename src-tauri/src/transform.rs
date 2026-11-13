//! トリミング・リサイズ（純粋関数のみ。Tauri には依存しない）

use image::RgbaImage;
use serde::Deserialize;

/// 出力画像の一辺の上限（ピクセル）
pub const MAX_DIMENSION: u32 = 8192;

/// 切り抜き範囲（元画像のピクセル座標）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct CropRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

/// 出力サイズ
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub struct Size {
    pub width: u32,
    pub height: u32,
}

/// 指定範囲で切り抜く。範囲が空、または画像からはみ出す場合はエラー。
pub fn crop(img: &RgbaImage, rect: CropRect) -> Result<RgbaImage, String> {
    let (w, h) = img.dimensions();
    let fits = |start: u32, len: u32, max: u32| start.checked_add(len).is_some_and(|end| end <= max);
    if rect.width == 0 || rect.height == 0 || !fits(rect.x, rect.width, w) || !fits(rect.y, rect.height, h) {
        return Err(format!(
            "切り抜き範囲が不正です: x={}, y={}, 幅={}, 高さ={}（画像サイズ {w}x{h}）",
            rect.x, rect.y, rect.width, rect.height
        ));
    }
    Ok(image::imageops::crop_imm(img, rect.x, rect.y, rect.width, rect.height).to_image())
}

/// 指定サイズにリサイズする。0 や上限超えはエラー。同サイズならそのまま返す。
pub fn resize(img: &RgbaImage, size: Size) -> Result<RgbaImage, String> {
    let valid = |v: u32| (1..=MAX_DIMENSION).contains(&v);
    if !valid(size.width) || !valid(size.height) {
        return Err(format!(
            "出力サイズが不正です: {}x{}（1〜{MAX_DIMENSION} ピクセルで指定してください）",
            size.width, size.height
        ));
    }
    if img.dimensions() == (size.width, size.height) {
        return Ok(img.clone());
    }
    Ok(image::imageops::resize(img, size.width, size.height, image::imageops::FilterType::Triangle))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    /// 各ピクセルの R=x, G=y となる画像
    fn coords(w: u32, h: u32) -> RgbaImage {
        RgbaImage::from_fn(w, h, |x, y| Rgba([x as u8, y as u8, 0, 255]))
    }

    fn rect(x: u32, y: u32, width: u32, height: u32) -> CropRect {
        CropRect { x, y, width, height }
    }

    // ---------- crop ----------

    #[test]
    fn crop_extracts_the_requested_region() {
        let out = crop(&coords(10, 8), rect(2, 3, 4, 2)).unwrap();
        assert_eq!(out.dimensions(), (4, 2));
        assert_eq!(*out.get_pixel(0, 0), Rgba([2, 3, 0, 255]));
        assert_eq!(*out.get_pixel(3, 1), Rgba([5, 4, 0, 255]));
    }

    #[test]
    fn crop_full_image_is_identity() {
        let img = coords(5, 5);
        assert_eq!(crop(&img, rect(0, 0, 5, 5)).unwrap(), img);
    }

    #[test]
    fn crop_rejects_empty_region() {
        let err = crop(&coords(5, 5), rect(0, 0, 0, 3)).unwrap_err();
        assert!(err.contains("切り抜き範囲"), "{err}");
        assert!(crop(&coords(5, 5), rect(0, 0, 3, 0)).is_err());
    }

    #[test]
    fn crop_rejects_out_of_bounds_region() {
        let img = coords(5, 5);
        assert!(crop(&img, rect(3, 0, 3, 1)).is_err()); // x+width > 5
        assert!(crop(&img, rect(0, 4, 1, 2)).is_err()); // y+height > 5
        assert!(crop(&img, rect(u32::MAX, 0, 2, 1)).is_err()); // オーバーフローしない
    }

    // ---------- resize ----------

    #[test]
    fn resize_changes_dimensions() {
        let out = resize(&coords(8, 6), Size { width: 4, height: 9 }).unwrap();
        assert_eq!(out.dimensions(), (4, 9));
    }

    #[test]
    fn resize_keeps_solid_color() {
        let img = RgbaImage::from_pixel(10, 10, Rgba([12, 34, 56, 200]));
        let out = resize(&img, Size { width: 3, height: 7 }).unwrap();
        assert!(out.pixels().all(|p| *p == Rgba([12, 34, 56, 200])));
    }

    #[test]
    fn resize_same_size_is_identity() {
        let img = coords(6, 4);
        assert_eq!(resize(&img, Size { width: 6, height: 4 }).unwrap(), img);
    }

    #[test]
    fn resize_rejects_zero_or_too_large() {
        let img = coords(4, 4);
        let err = resize(&img, Size { width: 0, height: 4 }).unwrap_err();
        assert!(err.contains("出力サイズ"), "{err}");
        assert!(resize(&img, Size { width: 4, height: 0 }).is_err());
        assert!(resize(&img, Size { width: MAX_DIMENSION + 1, height: 4 }).is_err());
        assert!(resize(&img, Size { width: 4, height: MAX_DIMENSION + 1 }).is_err());
    }

    #[test]
    fn deserializes_from_json() {
        let r: CropRect = serde_json::from_str(r#"{"x":1,"y":2,"width":3,"height":4}"#).unwrap();
        assert_eq!(r, rect(1, 2, 3, 4));
        let s: Size = serde_json::from_str(r#"{"width":5,"height":6}"#).unwrap();
        assert_eq!(s, Size { width: 5, height: 6 });
    }
}
