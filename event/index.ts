import 'server-only';
import offer from './offer';

type EventManager = () => {
  [key: string]: (...args: any[]) => Promise<unknown>;
};


/**
 * Creates an instance of EventManager.
 *
 * @returns An object containing the event methods.
 */
const eventManager: EventManager = () => {
  return {
    offer,
  };
};

export default eventManager();
