// HEIC テスト用フィクスチャの生成スクリプト（macOS の ImageIO を使用）
// 使い方: swift src-tauri/tests/fixtures/generate_heic.swift src-tauri/tests/fixtures
//
// - sample.heic : 16x8、左半分が赤・右半分が青、向き情報なし (orientation = 1)
// - rotated.heic: 同じ画素に orientation = 6（表示時に 90° 時計回り）を付与
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let outDir = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".")
let width = 16, height = 8
var pixels = [UInt8](repeating: 0, count: width * height * 4)
for y in 0..<height {
    for x in 0..<width {
        let i = (y * width + x) * 4
        if x < width / 2 { pixels[i] = 255 } else { pixels[i + 2] = 255 }
        pixels[i + 3] = 255
    }
}
let ctx = CGContext(
    data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
let image = ctx.makeImage()!

func write(_ name: String, orientation: Int) {
    let url = outDir.appendingPathComponent(name)
    let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.heic.identifier as CFString, 1, nil)!
    let props: [CFString: Any] = [
        kCGImageDestinationLossyCompressionQuality: 1.0,
        kCGImagePropertyOrientation: orientation,
    ]
    CGImageDestinationAddImage(dest, image, props as CFDictionary)
    precondition(CGImageDestinationFinalize(dest), "failed to write \(name)")
    print("wrote \(url.path)")
}

write("sample.heic", orientation: 1)
write("rotated.heic", orientation: 6)
