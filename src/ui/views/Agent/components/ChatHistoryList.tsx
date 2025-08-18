import React, { useState } from 'react';

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
      <div className="h-full bg-white dark:bg-gray-900">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Chat History</div>
            <div className="flex gap-2">
              {onExport && (
                <button
                  className="p-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                  onClick={handleExport}
                  title="Export sessions"
                >
                  📤
                </button>
              )}
              {onImport && (
                <label className="p-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors cursor-pointer" title="Import sessions">
                  📥
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImport}
                    className="hidden"
                  />
                </label>
              )}
              {onNewChat && (
                <button className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors" onClick={handleNewChat}>
                  New Chat
                </button>
              )}
            </div>
          </div>

          {(searchable || hasFilters) && (
            <div className="space-y-3">
              {searchable && (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search sessions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              )}

              {allTags.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by tags:</div>
                  <div className="flex flex-wrap gap-2">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${
                          selectedTags.includes(tag)
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                        }`}
                        onClick={() => toggleTag(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={showBookmarkedOnly}
                    onChange={(e) => setShowBookmarkedOnly(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500"
                  />
                  Bookmarked only
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={showArchivedOnly}
                    onChange={(e) => setShowArchivedOnly(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500"
                  />
                  Archived only
                </label>
                {hasFilters && (
                  <button className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-4xl mb-4 opacity-50">💬</div>
          <div className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {hasFilters
              ? 'No sessions match your filters'
              : 'No chat history yet'}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {hasFilters
              ? 'Try adjusting your search or filters'
              : 'Start a conversation to see your chat sessions here'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white dark:bg-gray-900">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="text-lg font-semibold text-gray-900 dark:text-white">Chat History</div>
          <div className="flex gap-2">
            {onExport && (
              <button
                className="p-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                onClick={handleExport}
                title="Export sessions"
              >
                📤
              </button>
            )}
            {onImport && (
              <label className="p-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors cursor-pointer" title="Import sessions">
                📥
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
            )}
            {onNewChat && (
              <button className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors" onClick={handleNewChat}>
                New Chat
              </button>
            )}
          </div>
        </div>

        {(searchable || allTags.length > 0) && (
          <div className="space-y-3">
            {searchable && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search sessions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            )}

            {allTags.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by tags:</div>
                <div className="flex flex-wrap gap-2">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      className={`px-2 py-1 text-xs rounded-full transition-colors ${
                        selectedTags.includes(tag)
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      }`}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={showBookmarkedOnly}
                  onChange={(e) => setShowBookmarkedOnly(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500"
                />
                Bookmarked only
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={showArchivedOnly}
                  onChange={(e) => setShowArchivedOnly(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500"
                />
                Archived only
              </label>
              {(searchQuery ||
                selectedTags.length > 0 ||
                showBookmarkedOnly ||
                showArchivedOnly) && (
                <button className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100% - 200px)' }}>
        {filteredSessions.map((session) => (
          <div
            key={session.id}
            className={`p-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${session.isArchived ? 'opacity-60' : ''} ${session.isBookmarked ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}`}
            onClick={() => handleSessionClick(session.id)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {session.isBookmarked && (
                    <span className="text-yellow-500">⭐</span>
                  )}
                  <div className="font-medium text-gray-900 dark:text-white truncate">
                    {session.title || `Session ${session.id.slice(-8)}`}
                  </div>
                  {session.isArchived && (
                    <span className="text-gray-500">📦</span>
                  )}
                </div>
                
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <span>
                    {session.messageCount} message
                    {session.messageCount !== 1 ? 's' : ''}
                    {session.stepCount > 0 &&
                      ` • ${session.stepCount} step${
                        session.stepCount !== 1 ? 's' : ''
                      }`}
                  </span>
                  <span>
                    {formatDate(session.lastMessageAt || session.createdAt)}
                  </span>
                </div>

                {session.tags && session.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {session.tags.map((tag) => (
                      <span key={tag} className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {session.firstMessage && (
                  <div className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {session.firstMessage}
                    {session.firstMessage.length > 100 && '...'}
                  </div>
                )}
              </div>
              
              <div className="relative ml-2">
                <button
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
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
                  <div className="absolute right-0 top-8 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-[150px]">
                    {onBookmark && (
                      <button
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
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
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
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
                        className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 transition-colors flex items-center gap-2"
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
          </div>
        ))}
      </div>
    </div>
  );
}
