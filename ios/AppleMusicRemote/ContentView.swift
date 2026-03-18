import SwiftUI

// MARK: - Colours

private extension Color {
    static let amBackground = Color(red: 10/255,  green: 10/255,  blue: 10/255)
    static let amSurface    = Color(red: 34/255,  green: 34/255,  blue: 34/255)
    static let amAccent     = Color(red: 252/255, green: 60/255,  blue: 68/255)
    static let amMuted      = Color(red: 136/255, green: 136/255, blue: 136/255)
    static let amGreen      = Color(red: 48/255,  green: 209/255, blue: 88/255)
    static let amRed        = Color(red: 255/255, green: 69/255,  blue: 58/255)
}

// MARK: - ContentView

struct ContentView: View {
    @EnvironmentObject var ws: WebSocketManager
    @State private var showQueue    = false
    @State private var isScrubbing  = false
    @State private var scrubRatio:  Double = 0
    @State private var volumeValue: Double = 0.8

    // while scrubbing we show the drag position, otherwise real playback time
    private var displayProgress: Double {
        guard ws.musicState.duration > 0 else { return 0 }
        return isScrubbing
            ? scrubRatio
            : ws.musicState.currentTime / ws.musicState.duration
    }

    var body: some View {
        ZStack {
            Color.amBackground.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 0) {
                    statusBar
                        .padding(.horizontal, 20)
                        .padding(.top, 8)
                        .padding(.bottom, 28)

                    artworkView
                        .padding(.bottom, 28)

                    trackInfo
                        .padding(.horizontal, 20)
                        .padding(.bottom, 20)

                    progressSection
                        .padding(.horizontal, 20)
                        .padding(.bottom, 24)

                    controlsRow
                        .padding(.horizontal, 20)
                        .padding(.bottom, 28)

                    volumeRow
                        .padding(.horizontal, 20)
                        .padding(.bottom, 20)

                    upNextButton
                        .padding(.bottom, 16)
                }
            }
            .scrollDisabled(true)

            if !ws.hostConnected {
                noHostOverlay
            }
        }
        .sheet(isPresented: $showQueue) {
            QueueView(queue: ws.musicState.queue)
        }
    }

    // MARK: - Status bar

    private var statusBar: some View {
        HStack {
            if ws.isConnected && ws.remoteCount > 1 {
                let others = ws.remoteCount - 1
                Label("\(others) other\(others == 1 ? "" : "s")", systemImage: "person.2")
                    .font(.system(size: 12))
                    .foregroundColor(.amMuted)
            }
            Spacer()
            HStack(spacing: 6) {
                Circle()
                    .fill(ws.isConnected ? Color.amGreen : Color.amRed)
                    .frame(width: 7, height: 7)
                Text(ws.isConnected ? "Connected" : "Reconnecting…")
                    .font(.system(size: 12))
                    .foregroundColor(.amMuted)
            }
        }
    }

    // MARK: - Artwork

    private var artworkView: some View {
        let size = min(UIScreen.main.bounds.width * 0.72, 280.0)
        return Group {
            if let url = ws.musicState.artworkURL {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().aspectRatio(contentMode: .fill)
                    default: Color.amSurface
                    }
                }
            } else {
                ZStack {
                    LinearGradient(
                        colors: [Color(red: 30/255, green: 30/255, blue: 30/255),
                                 Color(red: 42/255, green: 42/255, blue: 42/255)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                    Image(systemName: "music.note")
                        .font(.system(size: 52))
                        .foregroundColor(Color(white: 0.23))
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.7), radius: 30, y: 20)
        .scaleEffect(ws.musicState.isPlaying ? 1.04 : 1.0)
        .animation(.easeInOut(duration: 0.3), value: ws.musicState.isPlaying)
    }

    // MARK: - Track info

    private var trackInfo: some View {
        VStack(spacing: 4) {
            Text(ws.musicState.title.isEmpty ? "—" : ws.musicState.title)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.white)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .center)

            Text(ws.musicState.artist.isEmpty ? "—" : ws.musicState.artist)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.amAccent)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .center)

            if !ws.musicState.album.isEmpty {
                Text(ws.musicState.album)
                    .font(.system(size: 13))
                    .foregroundColor(.amMuted)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
        }
    }

    // MARK: - Progress

    private var progressSection: some View {
        VStack(spacing: 6) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.amSurface)
                        .frame(height: 4)
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color.white)
                        .frame(width: max(0, geo.size.width * displayProgress), height: 4)
                }
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { val in
                            isScrubbing = true
                            scrubRatio  = max(0, min(1, val.location.x / geo.size.width))
                        }
                        .onEnded { val in
                            let ratio    = max(0, min(1, val.location.x / geo.size.width))
                            let seekTime = ratio * ws.musicState.duration
                            ws.sendCommand("SEEK", extra: ["seekTime": seekTime])
                            isScrubbing  = false
                        }
                )
            }
            .frame(height: 24)

            HStack {
                Text(formatTime(isScrubbing
                    ? scrubRatio * ws.musicState.duration
                    : ws.musicState.currentTime))
                Spacer()
                Text(formatTime(ws.musicState.duration))
            }
            .font(.system(size: 11))
            .foregroundColor(.amMuted)
        }
    }

    // MARK: - Controls

    private var controlsRow: some View {
        HStack(spacing: 20) {
            activeButton(icon: "shuffle", active: ws.musicState.shuffleMode == 1) {
                ws.sendCommand("SET_SHUFFLE",
                    extra: ["shuffleMode": ws.musicState.shuffleMode == 0 ? 1 : 0])
            }

            Button { ws.sendCommand("PREV") } label: {
                Image(systemName: "backward.fill")
                    .font(.system(size: 26))
                    .foregroundColor(.white)
            }

            Button { ws.sendCommand("TOGGLE_PLAY") } label: {
                ZStack {
                    Circle()
                        .fill(Color.white)
                        .frame(width: 68, height: 68)
                        .shadow(color: .white.opacity(0.15), radius: 10)
                    Image(systemName: ws.musicState.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 26))
                        .foregroundColor(.amBackground)
                }
            }

            Button { ws.sendCommand("NEXT") } label: {
                Image(systemName: "forward.fill")
                    .font(.system(size: 26))
                    .foregroundColor(.white)
            }

            // cycles none(0) → all(2) → one(1) → none
            activeButton(icon: ws.musicState.repeatMode == 1 ? "repeat.1" : "repeat",
                         active: ws.musicState.repeatMode != 0) {
                let next = ws.musicState.repeatMode == 0 ? 2
                         : ws.musicState.repeatMode == 2 ? 1 : 0
                ws.sendCommand("SET_REPEAT", extra: ["repeatMode": next])
            }
        }
        .frame(maxWidth: 340)
        .buttonStyle(ScaleButtonStyle())
    }

    @ViewBuilder
    private func activeButton(icon: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(active ? .amAccent : .amMuted)
                Circle()
                    .fill(active ? Color.amAccent : Color.clear)
                    .frame(width: 4, height: 4)
            }
        }
    }

    // MARK: - Volume

    private var volumeRow: some View {
        HStack(spacing: 10) {
            Image(systemName: "speaker.fill")
                .font(.system(size: 14))
                .foregroundColor(.amMuted)

            Slider(value: $volumeValue, in: 0...1)
                .tint(.white)
                .onChange(of: volumeValue, perform: { newVal in
                    ws.sendCommand("SET_VOLUME", extra: ["volume": newVal])
                })

            Image(systemName: "speaker.wave.3.fill")
                .font(.system(size: 14))
                .foregroundColor(.amMuted)
        }
        .frame(maxWidth: 340)
    }

    // MARK: - Up Next

    private var upNextButton: some View {
        Button { showQueue = true } label: {
            Label("Up Next", systemImage: "list.bullet")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.amMuted)
        }
    }

    // MARK: - No host overlay

    private var noHostOverlay: some View {
        ZStack {
            Color.black.opacity(0.88).ignoresSafeArea()
            VStack(spacing: 12) {
                Image(systemName: "slash.circle")
                    .font(.system(size: 48))
                    .foregroundColor(.amAccent)

                Text(ws.isConnected ? "No host connected" : "Connecting…")
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(.white)

                Text(ws.isConnected
                    ? "Make sure Apple Music is open in Chrome with the extension enabled."
                    : "Connecting to relay server…")
                    .font(.system(size: 14))
                    .foregroundColor(.amMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 260)
            }
        }
    }

    // MARK: - Helpers

    private func formatTime(_ seconds: Double) -> String {
        guard seconds.isFinite && seconds >= 0 else { return "0:00" }
        let m = Int(seconds) / 60
        let s = Int(seconds) % 60
        return "\(m):\(String(format: "%02d", s))"
    }
}

// MARK: - Button scale feedback

struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.5 : 1)
            .scaleEffect(configuration.isPressed ? 0.9 : 1)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}
