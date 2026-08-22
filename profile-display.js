(() => {
  const hiddenPackages = Object.freeze([
    "heart-attack",
    "oneday-test",
    "peacenotwar",
  ]);

  const featuredPackages = Object.freeze([
    Object.freeze({
      name: "event-pubsub",
      repository: "https://github.com/RIAEvangelist/event-pubsub",
      image: "assets/packages/event-pubsub.png",
      alt: "event-pubsub — fast synchronous events for Node.js and browsers",
      documentation: "https://riaevangelist.github.io/event-pubsub/",
      sourceRelease: Object.freeze({
        version: "6.1.0",
        url: "https://github.com/RIAEvangelist/event-pubsub/releases/tag/6.1.0",
      }),
    }),
    Object.freeze({
      name: "node-ipc",
      repository: "https://github.com/RIAEvangelist/node-ipc",
      image: "https://raw.githubusercontent.com/RIAEvangelist/node-ipc/main/assets/node-ipc-header.png",
      alt: "node-ipc — local and remote inter-process communication for Node.js",
      documentation: "https://riaevangelist.github.io/node-ipc/",
    }),
    Object.freeze({
      name: "node-cmd",
      repository: "https://github.com/RIAEvangelist/node-cmd",
      image: "https://raw.githubusercontent.com/RIAEvangelist/node-cmd/main/assets/node-cmd-header.png",
      alt: "node-cmd — command-line and process control for JavaScript",
    }),
    Object.freeze({
      name: "node-http-server",
      repository: "https://github.com/RIAEvangelist/node-http-server",
      image: "https://raw.githubusercontent.com/RIAEvangelist/node-http-server/main/assets/node-http-server-header.webp",
      alt: "node-http-server — small server, modern HTTP",
    }),
    Object.freeze({
      name: "strong-type",
      repository: "https://github.com/RIAEvangelist/strong-type",
      image: "https://raw.githubusercontent.com/RIAEvangelist/strong-type/main/assets/strong-type-header.png",
      alt: "strong-type — native JavaScript type enforcement",
    }),
    Object.freeze({
      name: "vanilla-test",
      repository: "https://github.com/RIAEvangelist/vanilla-test",
      image: "https://raw.githubusercontent.com/RIAEvangelist/vanilla-test/main/assets/vanilla-test-header.png",
      alt: "vanilla-test — native JavaScript testing for Node.js and browsers",
    }),
    Object.freeze({
      name: "js-message",
      repository: "https://github.com/RIAEvangelist/js-message",
      image: "https://raw.githubusercontent.com/RIAEvangelist/js-message/main/assets/js-message-header.png",
      alt: "js-message — normalized messages across browser and server runtimes",
    }),
    Object.freeze({
      name: "js-queue",
      repository: "https://github.com/RIAEvangelist/js-queue",
      image: "https://raw.githubusercontent.com/RIAEvangelist/js-queue/main/assets/js-queue-header.png",
      alt: "js-queue — explicit FIFO flow control for JavaScript",
    }),
    Object.freeze({
      name: "easy-stack",
      repository: "https://github.com/RIAEvangelist/easy-stack",
      image: "https://raw.githubusercontent.com/RIAEvangelist/easy-stack/main/assets/easy-stack-header.png",
      alt: "easy-stack — explicit LIFO flow control for JavaScript",
    }),
    Object.freeze({
      name: "dbopfs",
      repository: "https://github.com/TheWizardNexus/DBOPFS",
      image: "https://raw.githubusercontent.com/TheWizardNexus/DBOPFS/main/docs/assets/og.png",
      alt: "DBOPFS — a browser-native database written in files",
    }),
  ]);

  globalThis.RIA_PROFILE_DISPLAY = Object.freeze({ hiddenPackages, featuredPackages });
})();
