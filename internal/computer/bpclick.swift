// bpclick — minimal CGEvent CLI for KendaliAI's Computer Use layer.
// Ported verbatim from the x-agent prototype (tools/bpclick.swift).
//
// Usage:
//
//	bpclick check                      → prints "trusted:true|false"
//	bpclick move x y                   → move cursor (global display points)
//	bpclick click x y [count]          → click / double-click (count=2)
//	bpclick rclick x y                 → right click
//	bpclick drag x1 y1 x2 y2           → press, drag, release
//	bpclick scroll dx dy               → scroll deltas (positive dy = down)
//	bpclick text "string"              → type unicode text
//	bpclick key CODE [flags]           → press key by CGKeyCode with optional flags (shift|ctrl|alt|cmd, +-separated)
import AppKit
import CoreGraphics

let args = CommandLine.arguments

func flags(_ s: String?) -> CGEventFlags {
    guard let s = s else { return [] }
    var f: CGEventFlags = []
    for part in s.split(separator: "+") {
        switch part.lowercased() {
        case "shift": f.insert(.maskShift)
        case "ctrl", "control": f.insert(.maskControl)
        case "alt", "option": f.insert(.maskAlternate)
        case "cmd", "command": f.insert(.maskCommand)
        default: break
        }
    }
    return f
}

func post(_ e: CGEvent?) { guard let e = e else { return }; e.post(tap: .cghidEventTap); usleep(12_000) }

func mouseDown(up: Bool, at p: CGPoint, button: CGMouseButton = .left) {
    let ty: CGEventType = up ? .leftMouseUp : .leftMouseDown
    let e = CGEvent(mouseEventSource: nil, mouseType: ty, mouseCursorPosition: p, mouseButton: button)
    post(e)
}

func click(_ p: CGPoint, count: Int64 = 1) {
    let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left)
    post(move)
    usleep(60_000)
    for i in 1...max(1, count) {
        let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left)
        down?.setIntegerValueField(.mouseEventClickState, value: i)
        post(down)
        usleep(30_000)
        let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left)
        up?.setIntegerValueField(.mouseEventClickState, value: i)
        post(up)
        usleep(40_000)
    }
}

func num(_ s: String) -> CGFloat? { guard let d = Double(s) else { return nil }; return CGFloat(d) }

guard args.count >= 2 else {
    fputs("usage: bpclick <command> [args]\n", stderr)
    exit(2)
}

let trusted = AXIsProcessTrusted()

switch args[1] {
case "check":
    print("trusted:\(trusted)")
    exit(trusted ? 0 : 1)

case "move":
    guard args.count >= 4, let x = num(args[2]), let y = num(args[3]) else { exit(2) }
    let e = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: CGPoint(x: x, y: y), mouseButton: .left)
    post(e)

case "click":
    guard args.count >= 4, let x = num(args[2]), let y = num(args[3]) else { exit(2) }
    let count = args.count >= 5 ? (Int64(args[4]) ?? 1) : 1
    click(CGPoint(x: x, y: y), count: count)

case "rclick":
    guard args.count >= 4, let x = num(args[2]), let y = num(args[3]) else { exit(2) }
    let p = CGPoint(x: x, y: y)
    let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .right)
    post(move)
    let down = CGEvent(mouseEventSource: nil, mouseType: .rightMouseDown, mouseCursorPosition: p, mouseButton: .right)
    post(down)
    let up = CGEvent(mouseEventSource: nil, mouseType: .rightMouseUp, mouseCursorPosition: p, mouseButton: .right)
    post(up)

case "drag":
    guard args.count >= 6, let x1 = num(args[2]), let y1 = num(args[3]), let x2 = num(args[4]), let y2 = num(args[5]) else { exit(2) }
    let a = CGPoint(x: x1, y: y1), b = CGPoint(x: x2, y: y2)
    let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: a, mouseButton: .left)
    post(move)
    mouseDown(up: false, at: a)
    usleep(80_000)
    let steps = 24
    for i in 1...steps {
        let t = CGFloat(i) / CGFloat(steps)
        let p = CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
        let e = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left)
        post(e)
        usleep(12_000)
    }
    mouseDown(up: true, at: b)

case "scroll":
    guard args.count >= 4, let dx = Int(args[2]), let dy = Int(args[3]) else { exit(2) }
    for _ in 0..<max(1, abs(dy) / 4) {
        let e = CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: dy >= 0 ? -4 : 4, wheel2: 0, wheel3: 0)
        post(e)
        usleep(40_000)
    }

case "text":
    guard args.count >= 3 else { exit(2) }
    let s = args[2]
    for ch in s.unicodeScalars {
        let dn = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true)
        dn?.keyboardSetUnicodeString(stringLength: 1, unicodeString: [UniChar(ch.value)])
        post(dn)
        let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false)
        up?.keyboardSetUnicodeString(stringLength: 1, unicodeString: [UniChar(ch.value)])
        post(up)
        usleep(8_000)
    }

case "key":
    guard args.count >= 3, let raw = UInt16(args[2]) else { exit(2) }
    let code = CGKeyCode(raw)
    let f = flags(args.count >= 4 ? args[3] : nil)
    let dn = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)
    dn?.flags = f
    post(dn)
    let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)
    up?.flags = f
    post(up)

default:
    fputs("unknown command \(args[1])\n", stderr)
    exit(2)
}
