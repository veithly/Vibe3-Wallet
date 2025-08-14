import React, { useState } from 'react';
import type { FavoritePrompt } from '@/background/service/agent/storage/favorites';

interface BookmarkListProps {
  bookmarks: FavoritePrompt[];
  onBookmarkSelect: (content: string) => void;
  onBookmarkUpdateTitle: (id: number, title: string) => void;
  onBookmarkDelete: (id: number) => void;
  onBookmarkReorder: (draggedId: number, targetId: number) => void;
}

export default function BookmarkList({
  bookmarks,
  onBookmarkSelect,
  onBookmarkUpdateTitle,
  onBookmarkDelete,
  onBookmarkReorder,
}: BookmarkListProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const handleEdit = (bookmark: FavoritePrompt) => {
    setEditingId(bookmark.id);
    setNewTitle(bookmark.title);
  };

  const handleSave = (id: number) => {
    onBookmarkUpdateTitle(id, newTitle);
    setEditingId(null);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: number) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: number) => {
    e.preventDefault();
    if (draggedId !== null && draggedId !== targetId) {
      onBookmarkReorder(draggedId, targetId);
    }
    setDraggedId(null);
  };

  if (bookmarks.length === 0) {
    return (
      <div className="bookmark-list">
        <div className="header">
          <div className="title">Favorite Prompts</div>
        </div>
        <div className="empty-state">
          <div className="empty-icon">⭐</div>
          <div className="empty-message">No favorite prompts yet</div>
          <div className="empty-submessage">
            Start by typing a message below to begin your AI conversation
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bookmark-list">
      <div className="header">
        <div className="title">Favorite Prompts</div>
      </div>
      <div className="bookmarks-container">
        {bookmarks.map((bookmark) => (
          <div
            key={bookmark.id}
            className="bookmark-item"
            draggable
            onDragStart={(e) => handleDragStart(e, bookmark.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, bookmark.id)}
            onClick={() => onBookmarkSelect(bookmark.content)}
          >
            {editingId === bookmark.id ? (
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onBlur={() => handleSave(bookmark.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleSave(bookmark.id)}
                autoFocus
                className="bookmark-title-input"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                className="bookmark-title"
                onDoubleClick={() => handleEdit(bookmark)}
              >
                {bookmark.title}
              </div>
            )}
            <div className="bookmark-content" title={bookmark.content}>
              {bookmark.content.length > 100
                ? bookmark.content.substring(0, 100) + '...'
                : bookmark.content}
            </div>
            <div className="bookmark-meta">
              <div className="bookmark-date">
                {new Date(
                  bookmark.createdAt || Date.now()
                ).toLocaleDateString()}
              </div>
              <div className="bookmark-actions">
                <button
                  className="action-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(bookmark);
                  }}
                  title="Edit title"
                >
                  ✏️
                </button>
                <button
                  className="action-button delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this favorite prompt?')) {
                      onBookmarkDelete(bookmark.id);
                    }
                  }}
                  title="Delete"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
