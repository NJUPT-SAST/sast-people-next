import 'server-only';
import offer from './offer';

type EventManager = {
  offer: (userFlowId: number, accept: boolean) => Promise<void>;
};


/**
 * Creates an instance of EventManager.
 *
 * @returns An object containing the event methods.
 */
const eventManager = (): EventManager => {
  return {
    offer,
  };
};

export default eventManager();
