#!/bin/bash
set -e

INPUT="input.mp4"
OUTDIR="output"
mkdir -p "$OUTDIR"

# Define variants: [name resolution bitrate]
VARIANTS=(
  "360p 640x360 800k"
  "480p 854x480 1400k"
  "720p 1280x720 2800k"
)

# Copy input.mp4 to output directory if needed
cp "$INPUT" "$OUTDIR/"

# Change to output directory so everything is relative
cd "$OUTDIR"

# Encode each variant
for VARIANT in "${VARIANTS[@]}"; do
  read -r NAME RES BITRATE <<< "$VARIANT"

  ffmpeg -y -i "$INPUT" \
    -vf "scale=$RES" \
    -c:v libx264 -b:v $BITRATE -g 48 -keyint_min 48 -sc_threshold 0 \
    -c:a aac -b:a 128k \
    -f hls \
    -hls_time 2 \
    -hls_playlist_type vod \
    -hls_segment_type fmp4 \
    -hls_segment_filename "${NAME}_segment%d.m4s" \
    -hls_fmp4_init_filename "${NAME}_init.mp4" \
    -hls_flags independent_segments \
    "${NAME}.m3u8"
done

# Create master playlist
cat <<EOF > master.m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480
480p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720
720p.m3u8
EOF
