//! 画像のドット化・減色処理（純粋関数のみ。Tauri には依存しない）

use image::{Rgba, RgbaImage};
use serde::Deserialize;

/// 減色モード
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ColorMode {
    /// 16色（CGA 16色パレットへの最近傍マッピング）
    Color16,
    /// 256色（RGB332）
    Color256,
    /// 4096色（RGB444）
    Color4096,
    /// 65536色（RGB565）
    Color65536,
    /// モノクロ2階調
    Gray2,
    /// モノクロ8階調
    Gray8,
    /// モノクロ16階調
    Gray16,
    /// モノクロ256階調
    Gray256,
}

/// 画像を `block` ピクセル四方のブロックに分割し、各ブロックを平均色で塗りつぶす。
/// 出力サイズは入力と同じ。`block` が 0 または 1 の場合は入力をそのまま返す。
pub fn pixelate(img: &RgbaImage, block: u32) -> RgbaImage {
    if block <= 1 {
        return img.clone();
    }
    let (w, h) = img.dimensions();
    let mut out = RgbaImage::new(w, h);
    for by in (0..h).step_by(block as usize) {
        for bx in (0..w).step_by(block as usize) {
            let x_end = (bx + block).min(w);
            let y_end = (by + block).min(h);
            let mut sum = [0u64; 4];
            for y in by..y_end {
                for x in bx..x_end {
                    let p = img.get_pixel(x, y);
                    for c in 0..4 {
                        sum[c] += u64::from(p[c]);
                    }
                }
            }
            let n = u64::from((x_end - bx) * (y_end - by));
            let avg = Rgba(sum.map(|s| ((s + n / 2) / n) as u8));
            for y in by..y_end {
                for x in bx..x_end {
                    out.put_pixel(x, y, avg);
                }
            }
        }
    }
    out
}

/// CGA 16色パレット
const CGA_PALETTE: [[u8; 3]; 16] = [
    [0, 0, 0],
    [0, 0, 170],
    [0, 170, 0],
    [0, 170, 170],
    [170, 0, 0],
    [170, 0, 170],
    [170, 85, 0],
    [170, 170, 170],
    [85, 85, 85],
    [85, 85, 255],
    [85, 255, 85],
    [85, 255, 255],
    [255, 85, 85],
    [255, 85, 255],
    [255, 255, 85],
    [255, 255, 255],
];

/// 0..=255 の値を `levels` 段階に量子化し、0..=255 の代表値に戻す
fn quantize(v: u8, levels: u32) -> u8 {
    let max = levels - 1;
    let level = (u32::from(v) * max + 127) / 255;
    ((level * 255 + max / 2) / max) as u8
}

/// BT.601 輝度（整数演算・四捨五入）
fn luminance(r: u8, g: u8, b: u8) -> u8 {
    ((299 * u32::from(r) + 587 * u32::from(g) + 114 * u32::from(b) + 500) / 1000) as u8
}

fn nearest_cga(rgb: [u8; 3]) -> [u8; 3] {
    *CGA_PALETTE
        .iter()
        .min_by_key(|p| {
            (0..3)
                .map(|i| {
                    let d = i32::from(p[i]) - i32::from(rgb[i]);
                    d * d
                })
                .sum::<i32>()
        })
        .expect("palette is not empty")
}

fn map_rgb(rgb: [u8; 3], mode: ColorMode) -> [u8; 3] {
    let [r, g, b] = rgb;
    let rgb_levels = |lr, lg, lb| [quantize(r, lr), quantize(g, lg), quantize(b, lb)];
    let gray = |levels| {
        let v = quantize(luminance(r, g, b), levels);
        [v, v, v]
    };
    match mode {
        ColorMode::Color16 => nearest_cga(rgb),
        ColorMode::Color256 => rgb_levels(8, 8, 4),
        ColorMode::Color4096 => rgb_levels(16, 16, 16),
        ColorMode::Color65536 => rgb_levels(32, 64, 32),
        ColorMode::Gray2 => gray(2),
        ColorMode::Gray8 => gray(8),
        ColorMode::Gray16 => gray(16),
        ColorMode::Gray256 => gray(256),
    }
}

/// コントラストの調整範囲
pub const MAX_CONTRAST: i32 = 100;

/// コントラストを調整する。`amount` は -100〜100（範囲外は丸める）で 0 は変更なし。
/// 中間値 128 を中心に、係数 f = 259(c+255) / (255(259-c))（c = amount×2.55）で拡大・縮小する。
/// アルファ値は保持する。
pub fn adjust_contrast(img: &RgbaImage, amount: i32) -> RgbaImage {
    let amount = amount.clamp(-MAX_CONTRAST, MAX_CONTRAST);
    if amount == 0 {
        return img.clone();
    }
    let c = f64::from(amount) * 2.55;
    let factor = 259.0 * (c + 255.0) / (255.0 * (259.0 - c));
    let lut: [u8; 256] =
        std::array::from_fn(|v| (factor * (v as f64 - 128.0) + 128.0).round().clamp(0.0, 255.0) as u8);
    let mut out = img.clone();
    for p in out.pixels_mut() {
        for ch in &mut p.0[..3] {
            *ch = lut[usize::from(*ch)];
        }
    }
    out
}

/// 指定モードで減色する。アルファ値は保持する。
pub fn reduce_colors(img: &RgbaImage, mode: ColorMode) -> RgbaImage {
    let mut out = img.clone();
    for p in out.pixels_mut() {
        let [r, g, b] = map_rgb([p[0], p[1], p[2]], mode);
        *p = Rgba([r, g, b, p[3]]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn solid(w: u32, h: u32, px: [u8; 4]) -> RgbaImage {
        RgbaImage::from_pixel(w, h, Rgba(px))
    }

    // ---------- pixelate ----------

    #[test]
    fn pixelate_keeps_dimensions() {
        let img = solid(7, 5, [10, 20, 30, 255]);
        let out = pixelate(&img, 3);
        assert_eq!(out.dimensions(), (7, 5));
    }

    #[test]
    fn pixelate_block_size_0_or_1_returns_identical_image() {
        let mut img = solid(2, 2, [0, 0, 0, 255]);
        img.put_pixel(1, 1, Rgba([255, 128, 0, 200]));
        assert_eq!(pixelate(&img, 0), img);
        assert_eq!(pixelate(&img, 1), img);
    }

    #[test]
    fn pixelate_averages_each_block() {
        // 2x2 ブロック: 黒2つ・白2つ → 平均は (128,128,128) 付近（四捨五入）
        let mut img = solid(2, 2, [0, 0, 0, 255]);
        img.put_pixel(1, 0, Rgba([255, 255, 255, 255]));
        img.put_pixel(1, 1, Rgba([255, 255, 255, 255]));
        let out = pixelate(&img, 2);
        for p in out.pixels() {
            assert_eq!(*p, Rgba([128, 128, 128, 255]));
        }
    }

    #[test]
    fn pixelate_blocks_are_independent() {
        // 左半分赤・右半分青の 4x2 画像をブロック2で処理しても色が混ざらない
        let mut img = solid(4, 2, [255, 0, 0, 255]);
        for y in 0..2 {
            for x in 2..4 {
                img.put_pixel(x, y, Rgba([0, 0, 255, 255]));
            }
        }
        let out = pixelate(&img, 2);
        assert_eq!(*out.get_pixel(0, 0), Rgba([255, 0, 0, 255]));
        assert_eq!(*out.get_pixel(3, 1), Rgba([0, 0, 255, 255]));
    }

    #[test]
    fn pixelate_handles_partial_edge_blocks() {
        // 3x1 画像、ブロック2: [0..2) と [2..3) の2ブロック
        let mut img = solid(3, 1, [0, 0, 0, 255]);
        img.put_pixel(1, 0, Rgba([100, 100, 100, 255]));
        img.put_pixel(2, 0, Rgba([200, 10, 20, 255]));
        let out = pixelate(&img, 2);
        assert_eq!(*out.get_pixel(0, 0), Rgba([50, 50, 50, 255]));
        assert_eq!(*out.get_pixel(1, 0), Rgba([50, 50, 50, 255]));
        assert_eq!(*out.get_pixel(2, 0), Rgba([200, 10, 20, 255]));
    }

    #[test]
    fn pixelate_block_larger_than_image_gives_single_color() {
        let mut img = solid(2, 1, [0, 0, 0, 0]);
        img.put_pixel(1, 0, Rgba([255, 255, 255, 255]));
        let out = pixelate(&img, 100);
        assert_eq!(*out.get_pixel(0, 0), *out.get_pixel(1, 0));
        assert_eq!(*out.get_pixel(0, 0), Rgba([128, 128, 128, 128]));
    }

    #[test]
    fn pixelate_empty_image() {
        let img = RgbaImage::new(0, 0);
        assert_eq!(pixelate(&img, 4).dimensions(), (0, 0));
    }

    // ---------- adjust_contrast ----------

    fn gray(v: u8) -> RgbaImage {
        solid(1, 1, [v, v, v, 200])
    }

    fn contrast_of(v: u8, amount: i32) -> u8 {
        adjust_contrast(&gray(v), amount).get_pixel(0, 0)[0]
    }

    #[test]
    fn contrast_zero_is_identity() {
        let img = RgbaImage::from_fn(16, 16, |x, y| Rgba([(x * 16) as u8, (y * 16) as u8, 77, 99]));
        assert_eq!(adjust_contrast(&img, 0), img);
    }

    #[test]
    fn contrast_keeps_midpoint_and_alpha() {
        for amount in [-100, -40, 0, 40, 100] {
            let out = adjust_contrast(&gray(128), amount);
            assert_eq!(*out.get_pixel(0, 0), Rgba([128, 128, 128, 200]), "{amount}");
        }
    }

    #[test]
    fn positive_contrast_spreads_values_away_from_midpoint() {
        // amount=50: c=127.5, f≈2.954 → 128 + 2.954×(100−128) ≈ 45.3
        assert_eq!(contrast_of(100, 50), 45);
        assert!(contrast_of(160, 50) > 160);
    }

    #[test]
    fn negative_contrast_pulls_values_toward_midpoint() {
        let low = contrast_of(40, -50);
        let high = contrast_of(220, -50);
        assert!(low > 40 && low < 128, "{low}");
        assert!(high < 220 && high > 128, "{high}");
    }

    #[test]
    fn contrast_extremes() {
        // +100 はほぼ二値化、-100 は一面の中間灰色
        assert_eq!(contrast_of(100, 100), 0);
        assert_eq!(contrast_of(160, 100), 255);
        assert_eq!(contrast_of(0, -100), 128);
        assert_eq!(contrast_of(255, -100), 128);
    }

    #[test]
    fn contrast_amount_is_clamped() {
        assert_eq!(contrast_of(100, 500), contrast_of(100, MAX_CONTRAST));
        assert_eq!(contrast_of(100, -500), contrast_of(100, -MAX_CONTRAST));
    }

    #[test]
    fn contrast_applies_to_each_channel() {
        let img = solid(1, 1, [100, 128, 160, 255]);
        let out = adjust_contrast(&img, 50);
        assert_eq!(out.get_pixel(0, 0)[0], contrast_of(100, 50));
        assert_eq!(out.get_pixel(0, 0)[1], 128);
        assert_eq!(out.get_pixel(0, 0)[2], contrast_of(160, 50));
    }

    // ---------- reduce_colors: カラー ----------

    fn distinct_colors(img: &RgbaImage) -> usize {
        let mut set: Vec<[u8; 3]> = img.pixels().map(|p| [p[0], p[1], p[2]]).collect();
        set.sort();
        set.dedup();
        set.len()
    }

    /// 全RGBを粗くサンプリングしたグラデーション画像
    fn gradient() -> RgbaImage {
        RgbaImage::from_fn(64, 64, |x, y| {
            Rgba([(x * 4) as u8, (y * 4) as u8, ((x + y) * 2) as u8, 255])
        })
    }

    #[test]
    fn color16_uses_at_most_16_colors_and_maps_to_cga_palette() {
        let out = reduce_colors(&gradient(), ColorMode::Color16);
        assert!(distinct_colors(&out) <= 16);
        // 純白・純黒はそのまま
        let img = solid(1, 1, [255, 255, 255, 255]);
        assert_eq!(*reduce_colors(&img, ColorMode::Color16).get_pixel(0, 0), Rgba([255, 255, 255, 255]));
        let img = solid(1, 1, [3, 2, 1, 255]);
        assert_eq!(*reduce_colors(&img, ColorMode::Color16).get_pixel(0, 0), Rgba([0, 0, 0, 255]));
        // CGA ブラウン (170,85,0) の近傍はブラウンへ
        let img = solid(1, 1, [160, 90, 10, 255]);
        assert_eq!(*reduce_colors(&img, ColorMode::Color16).get_pixel(0, 0), Rgba([170, 85, 0, 255]));
    }

    #[test]
    fn color256_is_rgb332() {
        let out = reduce_colors(&gradient(), ColorMode::Color256);
        assert!(distinct_colors(&out) <= 256);
        // R: 8段階 (0,36,73,109,146,182,219,255), B: 4段階 (0,85,170,255)
        let img = solid(1, 1, [40, 40, 90, 255]);
        assert_eq!(*reduce_colors(&img, ColorMode::Color256).get_pixel(0, 0), Rgba([36, 36, 85, 255]));
    }

    #[test]
    fn color4096_is_rgb444() {
        let out = reduce_colors(&gradient(), ColorMode::Color4096);
        assert!(distinct_colors(&out) <= 4096);
        // 16段階: 17刻み
        let img = solid(1, 1, [20, 30, 255, 255]);
        assert_eq!(*reduce_colors(&img, ColorMode::Color4096).get_pixel(0, 0), Rgba([17, 34, 255, 255]));
    }

    #[test]
    fn color65536_is_rgb565() {
        let img = solid(1, 1, [0, 255, 255, 255]);
        assert_eq!(*reduce_colors(&img, ColorMode::Color65536).get_pixel(0, 0), Rgba([0, 255, 255, 255]));
        // R 32段階 (≈8.23刻み): 10 → level 1 → 8 / G 64段階 (≈4.05刻み): 10 → level 2 → 8
        let img = solid(1, 1, [10, 10, 10, 255]);
        assert_eq!(*reduce_colors(&img, ColorMode::Color65536).get_pixel(0, 0), Rgba([8, 8, 8, 255]));
    }

    // ---------- reduce_colors: モノクロ ----------

    #[test]
    fn gray2_is_black_or_white() {
        let out = reduce_colors(&gradient(), ColorMode::Gray2);
        for p in out.pixels() {
            assert!(p[0] == 0 || p[0] == 255);
            assert!(p[0] == p[1] && p[1] == p[2]);
        }
        assert_eq!(distinct_colors(&out), 2);
    }

    #[test]
    fn gray_levels_counts() {
        let ramp = RgbaImage::from_fn(256, 1, |x, _| Rgba([x as u8, x as u8, x as u8, 255]));
        assert_eq!(distinct_colors(&reduce_colors(&ramp, ColorMode::Gray8)), 8);
        assert_eq!(distinct_colors(&reduce_colors(&ramp, ColorMode::Gray16)), 16);
        assert_eq!(distinct_colors(&reduce_colors(&ramp, ColorMode::Gray256)), 256);
    }

    #[test]
    fn gray_uses_bt601_luminance() {
        // 純緑 (0,255,0) の輝度 = 0.587*255 ≈ 149.7 → 150
        let img = solid(1, 1, [0, 255, 0, 255]);
        assert_eq!(*reduce_colors(&img, ColorMode::Gray256).get_pixel(0, 0), Rgba([150, 150, 150, 255]));
    }

    #[test]
    fn reduce_colors_preserves_alpha_and_dimensions() {
        let img = solid(3, 2, [100, 150, 200, 77]);
        for mode in [
            ColorMode::Color16,
            ColorMode::Color256,
            ColorMode::Color4096,
            ColorMode::Color65536,
            ColorMode::Gray2,
            ColorMode::Gray8,
            ColorMode::Gray16,
            ColorMode::Gray256,
        ] {
            let out = reduce_colors(&img, mode);
            assert_eq!(out.dimensions(), (3, 2));
            assert!(out.pixels().all(|p| p[3] == 77), "{mode:?}");
        }
    }

    #[test]
    fn color_mode_deserializes_from_camel_case() {
        let m: ColorMode = serde_json::from_str("\"color4096\"").unwrap();
        assert_eq!(m, ColorMode::Color4096);
        let m: ColorMode = serde_json::from_str("\"gray2\"").unwrap();
        assert_eq!(m, ColorMode::Gray2);
    }
}
