const video = document.getElementById("video");

if (!window.MediaSource) {
  alert("MediaSource API is not supported in your browser.");
  throw new Error("MediaSource not supported.");
}

const mediaSource = new MediaSource();
video.src = URL.createObjectURL(mediaSource);

mediaSource.addEventListener("sourceopen", sourceOpen);

async function sourceOpen() {
  const mime = 'video/mp4; codecs="avc1.640029"'; // adjust if your video uses a different codec
  const sourceBuffer = mediaSource.addSourceBuffer(mime);

  const base = "https://171.67.71.217:8001/";

  const initSegmentUrl = base + "720p_init.mp4";
  const segmentUrls = [
    base + "720p_segment0.m4s",
    base + "720p_segment1.m4s",
    base + "720p_segment2.m4s",
    base + "720p_segment3.m4s",
    base + "720p_segment4.m4s",
    base + "720p_segment5.m4s",
    base + "720p_segment6.m4s",
    base + "720p_segment7.m4s",
    base + "720p_segment8.m4s",
    base + "720p_segment9.m4s",
    base + "720p_segment10.m4s",
    base + "720p_segment11.m4s",
    base + "720p_segment12.m4s",
    base + "720p_segment13.m4s",
    base + "720p_segment14.m4s",
    base + "720p_segment15.m4s",
    base + "720p_segment16.m4s",
    base + "720p_segment17.m4s"
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
  console.log(response)
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
