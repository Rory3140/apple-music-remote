import Foundation

// @MainActor ensures all @Published property changes happen on the main thread
@MainActor
class WebSocketManager: ObservableObject {
    @Published var musicState    = MusicState()
    @Published var isConnected   = false
    @Published var hostConnected = false
    @Published var remoteCount   = 0
    @Published var suggestions:  [Suggestion] = []

    private var webSocketTask:      URLSessionWebSocketTask?
    private var reconnectTask:      Task<Void, Never>?
    private var receiveTask:        Task<Void, Never>?
    private var lastSuggestedKey =  ""

    private let apiBase = "https://apple-music-remote-802824893434.us-central1.run.app"

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
        isConnected   = false
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
        case "state":             applyState(json)
        case "host_connected":    hostConnected = true
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
                    title:      ($0["title"]      as? String) ?? "",
                    artist:     ($0["artist"]     as? String) ?? "",
                    artworkURL: ($0["artwork"]    as? String).flatMap(URL.init),
                    queueIndex: ($0["queueIndex"] as? Int)    ?? 0
                )
            }
        }

        // fetch suggestions when the track changes
        let key = "\(musicState.title)|\(musicState.artist)"
        if key != lastSuggestedKey && !musicState.title.isEmpty {
            lastSuggestedKey = key
            Task { await fetchSuggestions() }
        }
    }

    // MARK: - Suggestions

    // calls the relay's /api/suggestions endpoint then verifies each result against iTunes
    func fetchSuggestions() async {
        var request = URLRequest(url: URL(string: "\(apiBase)/api/suggestions")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "title":   musicState.title,
            "artist":  musicState.artist,
            "album":   musicState.album,
            "artwork": musicState.artworkURL?.absoluteString ?? "",
            "queue":   musicState.queue.map { ["title": $0.title, "artist": $0.artist] }
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        guard
            let (data, _) = try? await URLSession.shared.data(for: request),
            let json      = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let results   = json["suggestions"] as? [[String: Any]]
        else { return }

        // verify each suggestion exists on Apple Music via iTunes Search, get artwork + trackId
        var verified: [Suggestion] = []
        await withTaskGroup(of: Suggestion?.self) { group in
            for s in results {
                guard let title  = s["title"]  as? String,
                      let artist = s["artist"] as? String else { continue }
                group.addTask {
                    let term   = "\(artist) \(title)".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
                    let url    = URL(string: "https://itunes.apple.com/search?term=\(term)&entity=song&limit=1")!
                    guard
                        let (data, _) = try? await URLSession.shared.data(from: url),
                        let json      = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                        let hits      = json["results"] as? [[String: Any]],
                        let hit       = hits.first,
                        let trackId   = hit["trackId"]      as? Int,
                        let artStr    = hit["artworkUrl100"] as? String
                    else { return nil }

                    return Suggestion(
                        title:      title,
                        artist:     artist,
                        artworkURL: URL(string: artStr.replacingOccurrences(of: "100x100", with: "300x300")),
                        trackId:    String(trackId)
                    )
                }
            }
            for await result in group {
                if let s = result { verified.append(s) }
            }
        }

        suggestions = verified
    }

    // MARK: - Send

    func sendCommand(_ action: String, extra: [String: Any] = [:]) {
        var payload: [String: Any] = ["type": "command", "action": action]
        extra.forEach { payload[$0] = $1 }
        sendRaw(payload)
    }

    private func sendRaw(_ data: [String: Any]) {
        guard
            let task = webSocketTask,
            let json = try? JSONSerialization.data(withJSONObject: data),
            let text = String(data: json, encoding: .utf8)
        else { return }
        task.send(.string(text)) { _ in }
    }
}
