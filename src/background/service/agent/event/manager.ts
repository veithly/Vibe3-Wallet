import { createLogger } from '@/utils/logger';
import type { EventCallback, EventData, Subscribers } from './types';
import { EventType, Actors, ExecutionState } from './types';

const logger = createLogger('EventManager');

export class EventManager {
  private subscribers: Subscribers = {
    [EventType.EXECUTION]: [],
    [EventType.THOUGHT]: [],
    [EventType.ACTION]: [],
    [EventType.OBSERVATION]: [],
    [EventType.ERROR]: [],
  };

  subscribe(eventType: EventType, callback: EventCallback): void {
    if (!this.subscribers[eventType]) {
      this.subscribers[eventType] = [];
    }
    this.subscribers[eventType].push(callback);
  }

  unsubscribe(eventType: EventType, callback: EventCallback): void {
    if (!this.subscribers[eventType]) {
      return;
    }
    this.subscribers[eventType] = this.subscribers[eventType].filter(
      (cb) => cb !== callback
    );
  }

  clearSubscribers(eventType?: EventType): void {
    if (eventType) {
      this.subscribers[eventType] = [];
    } else {
      for (const key in this.subscribers) {
        this.subscribers[key as EventType] = [];
      }
    }
  }

  emit(
    eventType: EventType,
    actor: Actors,
    state: string | ExecutionState,
    data?: any
  ): void {
    if (!this.subscribers[eventType]) {
      return;
    }

    const eventData: EventData = {
      type: eventType,
      actor,
      state,
      data,
      timestamp: Date.now(),
    };
    logger.debug(`${eventType} event emitted`, eventData);

    this.subscribers[eventType].forEach((callback) => {
      try {
        callback(eventData);
      } catch (error) {
        logger.error(`Error in event callback: ${error}`);
      }
    });
  }
}
