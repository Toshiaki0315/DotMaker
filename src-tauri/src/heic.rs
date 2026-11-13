//! HEIC/HEIF の判定とデコード。
//! `image` クレートは HEIC に対応していないため、macOS 標準の ImageIO を利用する。

use image::RgbaImage;

/// HEIF 系のメジャーブランド（ISO/IEC 23008-12）
const HEIF_BRANDS: [&[u8; 4]; 10] = [
    b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"hevm", b"hevs", b"mif1", b"msf1",
];

/// バイト列が HEIC/HEIF 画像か（ftyp ボックスのメジャーブランドで判定）
pub fn is_heif(data: &[u8]) -> bool {
    data.len() >= 12 && &data[4..8] == b"ftyp" && HEIF_BRANDS.iter().any(|b| &data[8..12] == *b)
}

/// HEIC/HEIF をデコードする。EXIF/HEIF の向き情報を反映した画像を返す。
#[cfg(target_os = "macos")]
pub fn decode_heif(data: &[u8]) -> Result<RgbaImage, String> {
    use std::ffi::c_void;

    use objc2_core_foundation::{CFBoolean, CFData, CFDictionary, CFString, CGPoint, CGRect, CGSize};
    use objc2_core_graphics::{
        kCGColorSpaceSRGB, CGBitmapContextCreate, CGColorSpace, CGContext, CGImage, CGImageAlphaInfo,
    };
    use objc2_image_io::{
        kCGImageSourceCreateThumbnailFromImageAlways, kCGImageSourceCreateThumbnailWithTransform, CGImageSource,
    };

    let fail = || "HEIC 画像の読み込みに失敗しました".to_string();

    let cf_data = CFData::from_bytes(data);
    // SAFETY: cf_data は有効な CFData。オプションは省略。
    let source = unsafe { CGImageSource::with_data(&cf_data, None) }.ok_or_else(fail)?;
    // SAFETY: source は有効な CGImageSource。
    if unsafe { source.count() } == 0 {
        return Err(fail());
    }

    // 向き情報を反映した原寸画像を得るため、サイズ無制限のサムネイルとして生成する
    // SAFETY: ImageIO が提供する定数文字列への参照。
    let keys = unsafe { [kCGImageSourceCreateThumbnailFromImageAlways, kCGImageSourceCreateThumbnailWithTransform] };
    let yes = CFBoolean::new(true);
    let options = CFDictionary::<CFString, CFBoolean>::from_slices(&keys, &[yes, yes]);
    // SAFETY: index 0 は count > 0 を確認済み。options のキーと値は ImageIO が期待する型。
    let image = unsafe { source.thumbnail_at_index(0, Some(options.as_opaque())) }.ok_or_else(fail)?;

    let (w, h) = (CGImage::width(Some(&image)), CGImage::height(Some(&image)));
    let mut buf = vec![0u8; w * h * 4];
    // SAFETY: CoreGraphics が提供する定数文字列への参照。
    let space = CGColorSpace::with_name(Some(unsafe { kCGColorSpaceSRGB })).ok_or_else(fail)?;
    // SAFETY: buf は w*h*4 バイトで、bytes_per_row = w*4 の RGBA8 ビットマップとして十分な大きさ。
    //         コンテキストは buf より先に破棄する。
    let ctx = unsafe {
        CGBitmapContextCreate(
            buf.as_mut_ptr().cast::<c_void>(),
            w,
            h,
            8,
            w * 4,
            Some(&space),
            CGImageAlphaInfo::PremultipliedLast.0,
        )
    }
    .ok_or_else(fail)?;
    let rect = CGRect::new(CGPoint::new(0.0, 0.0), CGSize::new(w as f64, h as f64));
    CGContext::draw_image(Some(&ctx), rect, Some(&image));
    drop(ctx);

    unpremultiply(&mut buf);
    Ok(RgbaImage::from_raw(w as u32, h as u32, buf).expect("buffer size matches dimensions"))
}

/// macOS 以外では HEIC を扱えない
#[cfg(not(target_os = "macos"))]
pub fn decode_heif(_data: &[u8]) -> Result<RgbaImage, String> {
    Err("HEIC 画像の読み込みは macOS でのみ対応しています".to_string())
}

/// 乗算済みアルファ (premultiplied) の RGBA を通常の RGBA に戻す
fn unpremultiply(buf: &mut [u8]) {
    for px in buf.as_chunks_mut::<4>().0 {
        let a = u16::from(px[3]);
        if a != 0 && a != 255 {
            for c in &mut px[..3] {
                *c = ((u16::from(*c) * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    const SAMPLE: &[u8] = include_bytes!("../tests/fixtures/sample.heic");
    const ROTATED: &[u8] = include_bytes!("../tests/fixtures/rotated.heic");

    /// 非可逆圧縮のため、各チャンネルが許容差以内なら同じ色とみなす
    fn approx(p: &Rgba<u8>, expected: [u8; 3]) -> bool {
        p.0[..3].iter().zip(expected).all(|(&a, b)| a.abs_diff(b) <= 40) && p.0[3] == 255
    }

    fn ftyp(brand: &[u8; 4]) -> Vec<u8> {
        let mut v = vec![0, 0, 0, 0x18];
        v.extend_from_slice(b"ftyp");
        v.extend_from_slice(brand);
        v.extend_from_slice(&[0; 12]);
        v
    }

    #[test]
    fn detects_heif_by_major_brand() {
        assert!(is_heif(SAMPLE));
        assert!(is_heif(ROTATED));
        for brand in HEIF_BRANDS {
            assert!(is_heif(&ftyp(brand)), "{}", String::from_utf8_lossy(brand));
        }
    }

    #[test]
    fn rejects_non_heif_data() {
        assert!(!is_heif(b""));
        assert!(!is_heif(b"\0\0\0\x18ftyp")); // ブランドまで届かない
        assert!(!is_heif(&ftyp(b"isom"))); // MP4
        assert!(!is_heif(&ftyp(b"avif"))); // AVIF は対象外
        assert!(!is_heif(b"\x89PNG\r\n\x1a\n\0\0\0\0\0\0\0\0"));
        let mut not_ftyp = ftyp(b"heic");
        not_ftyp[4..8].copy_from_slice(b"moov");
        assert!(!is_heif(&not_ftyp));
    }

    #[test]
    fn decodes_heic_pixels() {
        let img = decode_heif(SAMPLE).unwrap();
        assert_eq!(img.dimensions(), (16, 8));
        assert!(approx(img.get_pixel(2, 4), [255, 0, 0]), "{:?}", img.get_pixel(2, 4));
        assert!(approx(img.get_pixel(13, 4), [0, 0, 255]), "{:?}", img.get_pixel(13, 4));
    }

    #[test]
    fn applies_orientation() {
        // orientation=6: 表示時に 90° 時計回り → 左半分(赤)が上に来る 8x16 画像
        let img = decode_heif(ROTATED).unwrap();
        assert_eq!(img.dimensions(), (8, 16));
        assert!(approx(img.get_pixel(4, 2), [255, 0, 0]), "{:?}", img.get_pixel(4, 2));
        assert!(approx(img.get_pixel(4, 13), [0, 0, 255]), "{:?}", img.get_pixel(4, 13));
    }

    #[test]
    fn unpremultiply_restores_straight_alpha() {
        let mut buf = [64, 32, 0, 128, 10, 20, 30, 255, 0, 0, 0, 0];
        unpremultiply(&mut buf);
        assert_eq!(buf, [128, 64, 0, 128, 10, 20, 30, 255, 0, 0, 0, 0]);
    }

    #[test]
    fn corrupted_heif_returns_error() {
        let err = decode_heif(&ftyp(b"heic")).unwrap_err();
        assert!(err.contains("HEIC"), "{err}");
        assert!(decode_heif(&SAMPLE[..SAMPLE.len() / 2]).is_err());
    }
}
