import React, { useState } from 'react';
import '../styles/ChatHistoryList.less';

interface ChatSession {
  id: string;
  title: string;
  messageCount: number;
  stepCount: number;
  lastMessageAt: number;
  createdAt: number;
  isBookmarked?: boolean;
  isArchived?: boolean;
  tags?: string[];
  firstMessage?: string;
  lastMessage?: string;
}

interface ChatHistoryListProps {
  sessions: ChatSession[];
  onSessionSelect: (sessionId: string) => void;
  onNewChat?: () => void;
  onReplay?: (sessionId: string) => void;
  onBookmark?: (sessionId: string, isBookmarked: boolean) => void;
  onArchive?: (sessionId: string, isArchived: boolean) => void;
  onDelete?: (sessionId: string) => void;
  onExport?: () => void;
  onImport?: (file: File) => void;
  searchable?: boolean;
  showArchived?: boolean;
}

export default function ChatHistoryList({
  sessions,
  onSessionSelect,
  onNewChat,
  onReplay,
  onBookmark,
  onArchive,
  onDelete,
  onExport,
  onImport,
  searchable = false,
  showArchived = false,
}: ChatHistoryListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState(false);
  const [showArchivedOnly, setShowArchivedOnly] = useState(false);
  const [showMenuForSession, setShowMenuForSession] = useState<string | null>(
    null
  );

  // Get all unique tags from sessions
  const allTags = Array.from(
    new Set(sessions.flatMap((session) => session.tags || []))
  );

  // Filter sessions based on search and filters
  const filteredSessions = sessions.filter((session) => {
    // Hide archived sessions if not showing archived
    if (!showArchived && session.isArchived) return false;

    // Show only archived if archived filter is active
    if (showArchivedOnly && !session.isArchived) return false;

    // Show only bookmarked if bookmark filter is active
    if (showBookmarkedOnly && !session.isBookmarked) return false;

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const titleMatch = session.title.toLowerCase().includes(query);
      const messageMatch =
        session.firstMessage?.toLowerCase().includes(query) ||
        session.lastMessage?.toLowerCase().includes(query);
      const tagMatch = session.tags?.some((tag) =>
        tag.toLowerCase().includes(query)
      );

      if (!titleMatch && !messageMatch && !tagMatch) return false;
    }

    // Filter by selected tags
    if (selectedTags.length > 0) {
      const hasSelectedTag = selectedTags.some((tag) =>
        session.tags?.includes(tag)
      );
      if (!hasSelectedTag) return false;
    }

    return true;
  });
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();

    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return 'Today';
    }

    if (isYesterday) {
      return 'Yesterday';
    }

    const isThisYear = date.getFullYear() === now.getFullYear();

    if (isThisYear) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    return date.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleSessionClick = (sessionId: string) => {
    onSessionSelect(sessionId);
    setShowMenuForSession(null);
  };

  const handleNewChat = () => {
    if (onNewChat) {
      onNewChat();
    }
  };

  const handleBookmark = (sessionId: string, isBookmarked: boolean) => {
    if (onBookmark) {
      onBookmark(sessionId, isBookmarked);
    }
    setShowMenuForSession(null);
  };

  const handleArchive = (sessionId: string, isArchived: boolean) => {
    if (onArchive) {
      onArchive(sessionId, isArchived);
    }
    setShowMenuForSession(null);
  };

  const handleDelete = (sessionId: string) => {
    if (
      onDelete &&
      window.confirm('Are you sure you want to delete this session?')
    ) {
      onDelete(sessionId);
    }
    setShowMenuForSession(null);
  };

  const handleReplay = (sessionId: string) => {
    if (onReplay) {
      onReplay(sessionId);
    }
    setShowMenuForSession(null);
  };

  const handleExport = () => {
    if (onExport) {
      onExport();
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onImport) {
      onImport(file);
    }
    // Reset file input
    event.target.value = '';
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedTags([]);
    setShowBookmarkedOnly(false);
    setShowArchivedOnly(false);
  };

  if (filteredSessions.length === 0) {
    const hasFilters =
      searchQuery ||
      selectedTags.length > 0 ||
      showBookmarkedOnly ||
      showArchivedOnly;

    return (
      <div className="chat-history-list">
        <div className="header">
          <div className="title">Chat History</div>
          <div className="header-actions">
            {onExport && (
              <button
                className="export-button"
                onClick={handleExport}
                title="Export sessions"
              >
                📤
              </button>
            )}
            {onImport && (
              <label className="import-button" title="Import sessions">
                📥
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  style={{ display: 'none' }}
                />
              </label>
            )}
            {onNewChat && (
              <button className="new-chat-button" onClick={handleNewChat}>
                New Chat
              </button>
            )}
          </div>
        </div>

        {(searchable || hasFilters) && (
          <div className="filters-section">
            {searchable && (
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
              </div>
            )}

            {allTags.length > 0 && (
              <div className="tags-filter">
                <div className="tags-label">Filter by tags:</div>
                <div className="tags-list">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      className={`tag-button ${
                        selectedTags.includes(tag) ? 'selected' : ''
                      }`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="filter-toggles">
              <label className="filter-toggle">
                <input
                  type="checkbox"
                  checked={showBookmarkedOnly}
                  onChange={(e) => setShowBookmarkedOnly(e.target.checked)}
                />
                Bookmarked only
              </label>
              <label className="filter-toggle">
                <input
                  type="checkbox"
                  checked={showArchivedOnly}
                  onChange={(e) => setShowArchivedOnly(e.target.checked)}
                />
                Archived only
              </label>
              {hasFilters && (
                <button className="clear-filters" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        <div className="empty-state">
          <div className="empty-icon">💬</div>
          <div className="empty-message">
            {hasFilters
              ? 'No sessions match your filters'
              : 'No chat history yet'}
          </div>
          <div className="empty-submessage">
            {hasFilters
              ? 'Try adjusting your search or filters'
              : 'Start a conversation to see your chat sessions here'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-history-list">
      <div className="header">
        <div className="title">Chat History</div>
        <div className="header-actions">
          {onExport && (
            <button
              className="export-button"
              onClick={handleExport}
              title="Export sessions"
            >
              📤
            </button>
          )}
          {onImport && (
            <label className="import-button" title="Import sessions">
              📥
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                style={{ display: 'none' }}
              />
            </label>
          )}
          {onNewChat && (
            <button className="new-chat-button" onClick={handleNewChat}>
              New Chat
            </button>
          )}
        </div>
      </div>

      {(searchable || allTags.length > 0) && (
        <div className="filters-section">
          {searchable && (
            <div className="search-box">
              <input
                type="text"
                placeholder="Search sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          )}

          {allTags.length > 0 && (
            <div className="tags-filter">
              <div className="tags-label">Filter by tags:</div>
              <div className="tags-list">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    className={`tag-button ${
                      selectedTags.includes(tag) ? 'selected' : ''
                    }`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="filter-toggles">
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={showBookmarkedOnly}
                onChange={(e) => setShowBookmarkedOnly(e.target.checked)}
              />
              Bookmarked only
            </label>
            <label className="filter-toggle">
              <input
                type="checkbox"
                checked={showArchivedOnly}
                onChange={(e) => setShowArchivedOnly(e.target.checked)}
              />
              Archived only
            </label>
            {(searchQuery ||
              selectedTags.length > 0 ||
              showBookmarkedOnly ||
              showArchivedOnly) && (
              <button className="clear-filters" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      <div className="sessions-container">
        {filteredSessions.map((session) => (
          <div
            key={session.id}
            className={`session-item ${session.isArchived ? 'archived' : ''} ${
              session.isBookmarked ? 'bookmarked' : ''
            }`}
            onClick={() => handleSessionClick(session.id)}
          >
            <div className="session-header">
              <div className="session-title">
                {session.isBookmarked && (
                  <span className="bookmark-icon">⭐</span>
                )}
                {session.title || `Session ${session.id.slice(-8)}`}
                {session.isArchived && (
                  <span className="archived-icon">📦</span>
                )}
              </div>
              <div className="session-menu">
                <button
                  className="menu-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenuForSession(
                      showMenuForSession === session.id ? null : session.id
                    );
                  }}
                >
                  ⋮
                </button>
                {showMenuForSession === session.id && (
                  <div className="session-menu-dropdown">
                    {onReplay && (
                      <button
                        className="menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReplay(session.id);
                        }}
                      >
                        🔄 Replay
                      </button>
                    )}
                    {onBookmark && (
                      <button
                        className="menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBookmark(session.id, !session.isBookmarked);
                        }}
                      >
                        {session.isBookmarked ? '⭐ Unbookmark' : '⭐ Bookmark'}
                      </button>
                    )}
                    {onArchive && (
                      <button
                        className="menu-item"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchive(session.id, !session.isArchived);
                        }}
                      >
                        {session.isArchived ? '📦 Unarchive' : '📦 Archive'}
                      </button>
                    )}
                    {onDelete && (
                      <button
                        className="menu-item delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(session.id);
                        }}
                      >
                        🗑️ Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="session-meta">
              <span className="message-count">
                {session.messageCount} message
                {session.messageCount !== 1 ? 's' : ''}
                {session.stepCount > 0 &&
                  ` • ${session.stepCount} step${
                    session.stepCount !== 1 ? 's' : ''
                  }`}
              </span>
              <span className="session-date">
                {formatDate(session.lastMessageAt || session.createdAt)}
              </span>
            </div>

            {session.tags && session.tags.length > 0 && (
              <div className="session-tags">
                {session.tags.map((tag) => (
                  <span key={tag} className="session-tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {session.firstMessage && (
              <div className="session-preview">
                {session.firstMessage}
                {session.firstMessage.length > 100 && '...'}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
