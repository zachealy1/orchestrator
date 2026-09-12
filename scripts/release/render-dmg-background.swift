// Regenerate from the repository root on macOS:
// swift scripts/release/render-dmg-background.swift
import AppKit

let width = 660
let height = 400
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height,
    bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
    colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(srgbRed: 0.97, green: 0.97, blue: 0.96, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

// Use top-origin coordinates to match Finder's icon layout.
func text(_ value: String, top: CGFloat, size: CGFloat, weight: NSFont.Weight, color: NSColor) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    let attributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: color,
        .paragraphStyle: paragraph,
    ]
    (value as NSString).draw(in: NSRect(x: 32, y: CGFloat(height) - top - 36, width: 596, height: 36),
        withAttributes: attributes)
}
let ink = NSColor(srgbRed: 0.17, green: 0.19, blue: 0.21, alpha: 1)
let secondary = NSColor(srgbRed: 0.40, green: 0.43, blue: 0.46, alpha: 1)
text("ORCHESTRATOR", top: 26, size: 11, weight: .semibold, color: secondary)
text("Drag Orchestrator to Applications", top: 57, size: 23, weight: .semibold, color: ink)

// Finder supplies the real app and Applications icons; reserve their labels too.
let arrow = NSBezierPath()
arrow.lineWidth = 2.5
arrow.lineCapStyle = .round
arrow.lineJoinStyle = .round
arrow.move(to: NSPoint(x: 302, y: height - 170))
arrow.line(to: NSPoint(x: 358, y: height - 170))
arrow.move(to: NSPoint(x: 348, y: height - 180))
arrow.line(to: NSPoint(x: 358, y: height - 170))
arrow.line(to: NSPoint(x: 348, y: height - 160))
NSColor(srgbRed: 0.52, green: 0.56, blue: 0.59, alpha: 1).setStroke()
arrow.stroke()
text("After copying, eject this disk and open Orchestrator from Applications.",
    top: 298, size: 13, weight: .regular, color: secondary)
NSGraphicsContext.restoreGraphicsState()
let destination = URL(fileURLWithPath: "src-tauri/dmg/background.png")
try bitmap.representation(using: .png, properties: [:])!.write(to: destination)
print("Rendered \(destination.path)")
