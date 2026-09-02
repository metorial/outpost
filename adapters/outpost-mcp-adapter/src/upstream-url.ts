export let buildUpstreamUrl = (target: string, requestUrl: string): string => {
  let url = new URL(requestUrl);
  return new URL(url.pathname + url.search, target).toString();
};
