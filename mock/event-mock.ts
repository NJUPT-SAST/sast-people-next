/**
 * Mock event manager - replaces @/event in mock mode.
 * No server-only dependency. No Inngest queue. Just logs actions.
 */

const eventManager = {
  offer: async (userFlowId: number, accept: boolean) => {
    console.log(
      `[Mock] Email event: userFlowId=${userFlowId}, accept=${accept} (not actually sent)`
    );
  },
};

export default eventManager;
