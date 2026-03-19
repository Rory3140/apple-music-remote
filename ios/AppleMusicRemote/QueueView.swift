import SwiftUI

struct QueueView: View {
    @EnvironmentObject var ws: WebSocketManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Color(red: 28/255, green: 28/255, blue: 30/255).ignoresSafeArea()

                if ws.musicState.queue.isEmpty && ws.suggestions.isEmpty {
                    Text("Nothing queued")
                        .font(.system(size: 14))
                        .foregroundColor(Color(white: 0.55))
                } else {
                    ScrollView {
                        LazyVStack(spacing: 0) {

                            // MARK: Queue items
                            ForEach(ws.musicState.queue) { item in
                                Button {
                                    ws.sendCommand("PLAY_QUEUE_ITEM", extra: ["queueIndex": item.queueIndex])
                                    dismiss()
                                } label: {
                                    HStack(spacing: 12) {
                                        artworkView(url: item.artworkURL)
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(item.title)
                                                .font(.system(size: 15, weight: .medium))
                                                .foregroundColor(.white)
                                                .lineLimit(1)
                                            Text(item.artist)
                                                .font(.system(size: 13))
                                                .foregroundColor(Color(white: 0.55))
                                                .lineLimit(1)
                                        }
                                        Spacer()
                                    }
                                    .padding(.horizontal, 20)
                                    .padding(.vertical, 8)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)

                                if item.id != ws.musicState.queue.last?.id {
                                    Divider()
                                        .background(Color.white.opacity(0.06))
                                        .padding(.leading, 76)
                                }
                            }

                            // MARK: Suggestions
                            if !ws.suggestions.isEmpty {
                                HStack(spacing: 6) {
                                    Image(systemName: "sparkles")
                                        .font(.system(size: 12))
                                    Text("Suggested for You")
                                        .font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundColor(Color(white: 0.55))
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 20)
                                .padding(.top, 20)
                                .padding(.bottom, 10)
                                .overlay(alignment: .top) {
                                    Divider().background(Color.white.opacity(0.06))
                                }

                                ForEach(ws.suggestions) { suggestion in
                                    Button {
                                        ws.sendCommand("PLAY_SUGGESTION", extra: [
                                            "suggestionTerm": "\(suggestion.title) \(suggestion.artist)",
                                            "songId": suggestion.trackId
                                        ])
                                        dismiss()
                                    } label: {
                                        HStack(spacing: 12) {
                                            artworkView(url: suggestion.artworkURL)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(suggestion.title)
                                                    .font(.system(size: 15, weight: .medium))
                                                    .foregroundColor(.white)
                                                    .lineLimit(1)
                                                Text(suggestion.artist)
                                                    .font(.system(size: 13))
                                                    .foregroundColor(Color(white: 0.55))
                                                    .lineLimit(1)
                                            }
                                            Spacer()
                                        }
                                        .padding(.horizontal, 20)
                                        .padding(.vertical, 8)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)

                                    if suggestion.id != ws.suggestions.last?.id {
                                        Divider()
                                            .background(Color.white.opacity(0.06))
                                            .padding(.leading, 76)
                                    }
                                }
                            }
                        }
                        .padding(.bottom, 20)
                    }
                }
            }
            .navigationTitle("Up Next")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .foregroundColor(Color(red: 252/255, green: 60/255, blue: 68/255))
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .preferredColorScheme(.dark)
    }

    // @ViewBuilder lets us conditionally return different view types without wrapping in AnyView
    @ViewBuilder
    private func artworkView(url: URL?) -> some View {
        Group {
            if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let img): img.resizable().aspectRatio(contentMode: .fill)
                    default: Color(red: 34/255, green: 34/255, blue: 34/255)
                    }
                }
            } else {
                Color(red: 34/255, green: 34/255, blue: 34/255)
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}
