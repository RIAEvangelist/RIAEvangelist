const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/")) url.pathname += "index.html";

    const assetRequest = new Request(url, request);
    const response = await env.ASSETS.fetch(assetRequest);
    if (response.status !== 404 || request.method !== "GET") return response;

    return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
  },
};

export default worker;
