OUTPUT = master.m3u8

all: $(OUTPUT)

$(OUTPUT): input.mp4 encode.sh
	bash encode.sh

clean:
	cd output && rm -f *_init.mp4 *.m3u8 *_segment*.m4s
