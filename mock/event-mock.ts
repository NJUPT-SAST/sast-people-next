/**
 * Mock event manager - replaces @/event in mock mode.
 * No server-only dependency. No Inngest queue. Just logs actions.
 */

const eventManager = {
  offer: async (deliveryId: number) => {
    console.log(
      `[Mock] Email event: deliveryId=${deliveryId} (not actually sent)`
    );
  },
};

export default eventManager;
