from io import TextIOWrapper
import zstandard as zstd


class ZstdReader:
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        self.f = open(self.path, "rb")
        dctx = zstd.ZstdDecompressor()
        self.reader = dctx.stream_reader(self.f)
        self.wrapper = TextIOWrapper(self.reader, encoding="utf-8")
        return self.wrapper

    def __exit__(self, *a):
        self.f.close()
        return False


class ZstdWriter:
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        self.f = open(self.path, "wb")
        ctx = zstd.ZstdCompressor()
        self.writer = ctx.stream_writer(self.f)
        self.wrapper = TextIOWrapper(self.writer, encoding="utf-8")
        return self.wrapper

    def __exit__(self, *a):
        self.wrapper.flush()
        self.writer.flush(zstd.FLUSH_FRAME)
        self.f.close()
        return False
