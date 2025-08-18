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
      <div className="bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <div className="text-base font-semibold text-gray-900 dark:text-white">Favorite Prompts</div>
        </div>
        <div className="text-center py-10 px-5 text-gray-500 dark:text-gray-400">
          <div className="text-5xl mb-4 opacity-50">⭐</div>
          <div className="text-base mb-2">No favorite prompts yet</div>
          <div className="text-sm opacity-80">
            Start by typing a message below to begin your AI conversation
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="text-base font-semibold text-gray-900 dark:text-white">Favorite Prompts</div>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        {bookmarks.map((bookmark) => (
          <div
            key={bookmark.id}
            className="p-3 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer transition-all duration-200 hover:border-blue-500 hover:shadow-[0_2px_4px_rgba(0,0,0,0.1)]"
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
                className="w-full border border-blue-500 rounded px-2 py-1 text-sm font-medium mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <div
                className="text-sm font-medium text-gray-900 dark:text-white mb-1 overflow-hidden text-ellipsis whitespace-nowrap"
                onDoubleClick={() => handleEdit(bookmark)}
              >
                {bookmark.title}
              </div>
            )}
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2 leading-relaxed overflow-hidden line-clamp-2" title={bookmark.content}>
              {bookmark.content.length > 100
                ? bookmark.content.substring(0, 100) + '...'
                : bookmark.content}
            </div>
            <div className="flex justify-between items-center text-xs text-gray-400 dark:text-gray-500">
              <div className="italic">
                {new Date(
                  bookmark.createdAt || Date.now()
                ).toLocaleDateString()}
              </div>
              <div className="flex gap-2">
                <button
                  className="bg-transparent border-none text-gray-500 dark:text-gray-400 cursor-pointer px-1 py-0.5 rounded transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEdit(bookmark);
                  }}
                  title="Edit title"
                >
                  ✏️
                </button>
                <button
                  className="bg-transparent border-none text-gray-500 dark:text-gray-400 cursor-pointer px-1 py-0.5 rounded transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-red-500 dark:hover:text-red-400"
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
