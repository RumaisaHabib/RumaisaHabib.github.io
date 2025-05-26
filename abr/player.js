const video = document.getElementById("video");

if (!window.MediaSource) {
  alert("MediaSource API is not supported in your browser.");
  throw new Error("MediaSource not supported.");
}

const mediaSource = new MediaSource();
video.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener("sourceopen", sourceOpen);

async function sourceOpen() {
  const mime = 'video/mp4; codecs="avc1.64001e"';
  const sourceBuffer = mediaSource.addSourceBuffer(mime);

  const base = "https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths/";

  const initSegmentUrl = base + "video/init.mp4";
  const segmentUrls = [
    base + "video/seg-1.m4s",
    base + "video/seg-2.m4s",
    base + "video/seg-3.m4s",
    base + "video/seg-4.m4s",
    base + "video/seg-5.m4s"
  ];

  const initSegment = await fetchSegment(initSegmentUrl);
  sourceBuffer.appendBuffer(initSegment);

  let i = 0;
  sourceBuffer.addEventListener("updateend", async () => {
    if (i < segmentUrls.length) {
      const segment = await fetchSegment(segmentUrls[i++]);
      sourceBuffer.appendBuffer(segment);
    } else if (mediaSource.readyState === "open") {
      mediaSource.endOfStream();
    }
  });
}

async function fetchSegment(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
