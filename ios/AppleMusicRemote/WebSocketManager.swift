import Foundation

@MainActor
class WebSocketManager: ObservableObject {
    @Published var musicState   = MusicState()
    @Published var isConnected  = false
    @Published var hostConnected = false
    @Published var remoteCount  = 0

    private var webSocketTask: URLSessionWebSocketTask?
    private var reconnectTask: Task<Void, Never>?
    private var receiveTask:   Task<Void, Never>?

    private let serverURL = URL(string: "wss://apple-music-remote-802824893434.us-central1.run.app")!

    // MARK: - Connection

    func connect() {
        cancelTasks()
        let task = URLSession.shared.webSocketTask(with: serverURL)
        webSocketTask = task
        task.resume()
        sendRaw(["type": "register", "role": "remote"])
        isConnected = true
        receiveTask = Task { await receiveLoop() }
    }

    func disconnect() {
        cancelTasks()
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        isConnected  = false
    }

    private func cancelTasks() {
        reconnectTask?.cancel()
        receiveTask?.cancel()
        reconnectTask = nil
        receiveTask   = nil
    }

    // MARK: - Receive loop

    private func receiveLoop() async {
        guard let task = webSocketTask else { return }
        do {
            while !Task.isCancelled {
                let message = try await task.receive()
                if case .string(let text) = message { handleMessage(text) }
            }
        } catch {
            guard !Task.isCancelled else { return }
            isConnected = false
            scheduleReconnect()
        }
    }

    private func scheduleReconnect() {
        reconnectTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            connect()
        }
    }

    // MARK: - Message handling

    private func handleMessage(_ text: String) {
        guard
            let data = text.data(using: .utf8),
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = json["type"] as? String
        else { return }

        switch type {
        case "state":            applyState(json)
        case "host_connected":   hostConnected = true
        case "host_disconnected":
            hostConnected = false
            musicState    = MusicState()
        case "headcount":
            remoteCount = (json["remotes"] as? Int) ?? 0
        default: break
        }
    }

    private func applyState(_ json: [String: Any]) {
        musicState.isPlaying   = (json["isPlaying"]   as? Bool)   ?? false
        musicState.currentTime = (json["currentTime"] as? Double) ?? 0
        musicState.duration    = (json["duration"]    as? Double) ?? 0
        musicState.title       = (json["title"]       as? String) ?? ""
        musicState.artist      = (json["artist"]      as? String) ?? ""
        musicState.album       = (json["album"]       as? String) ?? ""

        if let s = json["artwork"] as? String, !s.isEmpty {
            musicState.artworkURL = URL(string: s)
        } else {
            musicState.artworkURL = nil
        }

        if let v = json["repeatMode"]  as? Int { musicState.repeatMode  = v }
        if let v = json["shuffleMode"] as? Int { musicState.shuffleMode = v }

        if let q = json["queue"] as? [[String: Any]] {
            musicState.queue = q.map {
                QueueItem(
                    title:      ($0["title"]  as? String) ?? "",
                    artist:     ($0["artist"] as? String) ?? "",
                    artworkURL: ($0["artwork"] as? String).flatMap(URL.init)
                )
            }
        }
    }

    // MARK: - Send

    func sendCommand(_ action: String, extra: [String: Any] = [:]) {
        var payload: [String: Any] = ["type": "command", "action": action]
        extra.forEach { payload[$0] = $1 }
        sendRaw(payload)
    }

    private func sendRaw(_ data: [String: Any]) {
        guard
            let task   = webSocketTask,
            let json   = try? JSONSerialization.data(withJSONObject: data),
            let text   = String(data: json, encoding: .utf8)
        else { return }
        task.send(.string(text)) { _ in }
    }
}
