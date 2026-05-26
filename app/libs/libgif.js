/*
This is a trimmed down version of `https://github.com/buzzfeed/libgif-js`, which was originally distributed under the following license:

Copyright (c) 2011 Shachaf Ben-Kiki

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
*/

// Generic functions
const bitsToNum = ba => ba.reduce((s, n) => s * 2 + n, 0);

const byteToBitArr = bite => {
  const a = [];
  for (let i = 7; i >= 0; i--) {
    a.push(!!(bite & (1 << i)));
  }
  return a;
};

class Stream {
  constructor(data) {
    this.data = data;
    this.pos = 0;
  }

  readByte() {
    if (this.pos >= this.data.length) {
      throw new Error("Attempted to read past end of stream.");
    }
    return this.data[this.pos++];
  }

  readBytes(n) {
    var bytes = [];
    for (var i = 0; i < n; i++) {
      bytes.push(this.readByte());
    }
    return bytes;
  }

  read(n) {
    return String.fromCharCode(...this.readBytes(n));
  }

  readUnsigned() {
    // Little-endian.
    const lo = this.readByte();
    const hi = this.readByte();
    return (hi << 8) + lo;
  }
}

const lzwDecode = (minCodeSize, data) => {
  // TODO: Now that the GIF parser is a bit different, maybe this should get an array of bytes instead of a String?
  var pos = 0; // Maybe this streaming thing should be merged with the Stream?
  var readCode = function (size) {
    var code = 0;
    for (var i = 0; i < size; i++) {
      if (data.charCodeAt(pos >> 3) & (1 << (pos & 7))) {
        code |= 1 << i;
      }
      pos++;
    }
    return code;
  };

  var output = [];

  var clearCode = 1 << minCodeSize;
  var eoiCode = clearCode + 1;

  var codeSize = minCodeSize + 1;

  var dict = [];

  var clear = function () {
    dict = [];
    codeSize = minCodeSize + 1;
    for (var i = 0; i < clearCode; i++) {
      dict[i] = [i];
    }
    dict[clearCode] = [];
    dict[eoiCode] = null;
  };

  var code;
  var last;

  while (true) {
    last = code;
    code = readCode(codeSize);

    if (code === clearCode) {
      clear();
      continue;
    }
    if (code === eoiCode) break;

    if (code < dict.length) {
      if (last !== clearCode) {
        dict.push(dict[last].concat(dict[code][0]));
      }
    } else {
      if (code !== dict.length) throw new Error("Invalid LZW code.");
      dict.push(dict[last].concat(dict[last][0]));
    }
    output.push.apply(output, dict[code]);

    if (dict.length === 1 << codeSize && codeSize < 12) {
      // If we're at the last code and codeSize is 12, the next code will be a clearCode, and it'll be 12 bits long.
      codeSize++;
    }
  }

  // I don't know if this is technically an error, but some GIFs do it.
  //if (Math.ceil(pos / 8) !== data.length) throw new Error('Extraneous LZW bytes.');
  return output;
};

const parseGIF = (st, handler) => {
  handler ??= {};

  // LZW (GIF-specific)
  var parseCT = function (entries) {
    // Each entry is 3 bytes, for RGB.
    var ct = [];
    for (var i = 0; i < entries; i++) {
      ct.push(st.readBytes(3));
    }
    return ct;
  };

  var readSubBlocks = function () {
    var size, data;
    data = "";
    do {
      size = st.readByte();
      data += st.read(size);
    } while (size !== 0);
    return data;
  };

  var parseHeader = function () {
    var hdr = {};
    hdr.sig = st.read(3);
    hdr.ver = st.read(3);
    if (hdr.sig !== "GIF") throw new Error("Not a GIF file."); // XXX: This should probably be handled more nicely.
    hdr.width = st.readUnsigned();
    hdr.height = st.readUnsigned();

    var bits = byteToBitArr(st.readByte());
    hdr.gctFlag = bits.shift();
    hdr.colorRes = bitsToNum(bits.splice(0, 3));
    hdr.sorted = bits.shift();
    hdr.gctSize = bitsToNum(bits.splice(0, 3));

    hdr.bgColor = st.readByte();
    hdr.pixelAspectRatio = st.readByte(); // if not 0, aspectRatio = (pixelAspectRatio + 15) / 64
    if (hdr.gctFlag) {
      hdr.gct = parseCT(1 << (hdr.gctSize + 1));
    }
    handler.hdr && handler.hdr(hdr);
  };

  var parseExt = function (block) {
    var parseGCExt = function (block) {
      var blockSize = st.readByte(); // Always 4
      var bits = byteToBitArr(st.readByte());
      block.reserved = bits.splice(0, 3); // Reserved; should be 000.
      block.disposalMethod = bitsToNum(bits.splice(0, 3));
      block.userInput = bits.shift();
      block.transparencyGiven = bits.shift();

      block.delayTime = st.readUnsigned();

      block.transparencyIndex = st.readByte();

      block.terminator = st.readByte();

      handler.gce && handler.gce(block);
    };

    var parseComExt = function (block) {
      block.comment = readSubBlocks();
      handler.com && handler.com(block);
    };

    var parsePTExt = function (block) {
      // No one *ever* uses this. If you use it, deal with parsing it yourself.
      var blockSize = st.readByte(); // Always 12
      block.ptHeader = st.readBytes(12);
      block.ptData = readSubBlocks();
      handler.pte && handler.pte(block);
    };

    var parseAppExt = function (block) {
      var parseNetscapeExt = function (block) {
        var blockSize = st.readByte(); // Always 3
        block.unknown = st.readByte(); // ??? Always 1? What is this?
        block.iterations = st.readUnsigned();
        block.terminator = st.readByte();
        handler.app && handler.app.NETSCAPE && handler.app.NETSCAPE(block);
      };

      var parseUnknownAppExt = function (block) {
        block.appData = readSubBlocks();
        // FIXME: This won't work if a handler wants to match on any identifier.
        handler.app && handler.app[block.identifier] && handler.app[block.identifier](block);
      };

      var blockSize = st.readByte(); // Always 11
      block.identifier = st.read(8);
      block.authCode = st.read(3);
      switch (block.identifier) {
        case "NETSCAPE":
          parseNetscapeExt(block);
          break;
        default:
          parseUnknownAppExt(block);
          break;
      }
    };

    var parseUnknownExt = function (block) {
      block.data = readSubBlocks();
      handler.unknown && handler.unknown(block);
    };

    block.label = st.readByte();
    switch (block.label) {
      case 0xf9:
        block.extType = "gce";
        parseGCExt(block);
        break;
      case 0xfe:
        block.extType = "com";
        parseComExt(block);
        break;
      case 0x01:
        block.extType = "pte";
        parsePTExt(block);
        break;
      case 0xff:
        block.extType = "app";
        parseAppExt(block);
        break;
      default:
        block.extType = "unknown";
        parseUnknownExt(block);
        break;
    }
  };

  var parseImg = function (img) {
    var deinterlace = function (pixels, width) {
      // Of course this defeats the purpose of interlacing. And it's *probably*
      // the least efficient way it's ever been implemented. But nevertheless...
      var newPixels = new Array(pixels.length);
      var rows = pixels.length / width;
      var cpRow = function (toRow, fromRow) {
        var fromPixels = pixels.slice(fromRow * width, (fromRow + 1) * width);
        newPixels.splice.apply(newPixels, [toRow * width, width].concat(fromPixels));
      };

      // See appendix E.
      var offsets = [0, 4, 2, 1];
      var steps = [8, 8, 4, 2];

      var fromRow = 0;
      for (var pass = 0; pass < 4; pass++) {
        for (var toRow = offsets[pass]; toRow < rows; toRow += steps[pass]) {
          cpRow(toRow, fromRow);
          fromRow++;
        }
      }

      return newPixels;
    };

    img.leftPos = st.readUnsigned();
    img.topPos = st.readUnsigned();
    img.width = st.readUnsigned();
    img.height = st.readUnsigned();

    var bits = byteToBitArr(st.readByte());
    img.lctFlag = bits.shift();
    img.interlaced = bits.shift();
    img.sorted = bits.shift();
    img.reserved = bits.splice(0, 2);
    img.lctSize = bitsToNum(bits.splice(0, 3));

    if (img.lctFlag) {
      img.lct = parseCT(1 << (img.lctSize + 1));
    }

    img.lzwMinCodeSize = st.readByte();

    var lzwData = readSubBlocks();

    img.pixels = lzwDecode(img.lzwMinCodeSize, lzwData);

    if (img.interlaced) {
      // Move
      img.pixels = deinterlace(img.pixels, img.width);
    }

    handler.img && handler.img(img);
  };

  var parseBlock = function () {
    var block = {};
    block.sentinel = st.readByte();

    switch (
      String.fromCharCode(block.sentinel) // For ease of matching
    ) {
      case "!":
        block.type = "ext";
        parseExt(block);
        break;
      case ",":
        block.type = "img";
        parseImg(block);
        break;
      case ";":
        block.type = "eof";
        handler.eof && handler.eof(block);
        break;
      default:
        throw new Error("Unknown block: 0x" + block.sentinel.toString(16)); // TODO: Pad this with a 0.
    }

    if (block.type !== "eof") parseBlock();
  };

  parseHeader();
  parseBlock();
};

export const loadGIF = data => {
  var hdr;
  var transparency = null;
  var delay = null;
  var disposalMethod = null;
  var disposalRestoreFromIdx = null;
  var lastDisposalMethod = null;
  var lastImg = null;
  var frame;

  const tmpCanvas = document.createElement("canvas");
  const frames = [];

  const pushFrame = () => {
    if (frame) {
      frames.push({data: frame.getImageData(0, 0, hdr.width, hdr.height), delay});
    }
  };

  parseGIF(new Stream(new Uint8Array(data)), {
    hdr: _hdr => {
      hdr = _hdr;
      tmpCanvas.width = hdr.width;
      tmpCanvas.height = hdr.height;
      tmpCanvas.style.width = hdr.width + "px";
      tmpCanvas.style.height = hdr.height + "px";
      tmpCanvas.getContext("2d").setTransform(1, 0, 0, 1, 0, 0);
    },
    gce: gce => {
      pushFrame();
      lastDisposalMethod = disposalMethod;
      transparency = gce.transparencyGiven ? gce.transparencyIndex : null;
      delay = gce.delayTime * 10;
      disposalMethod = gce.disposalMethod;
      // We don't have much to do with the rest of GCE.
    },
    com: () => {},
    img: img => {
      frame = tmpCanvas.getContext("2d");
      var currIdx = frames.length;

      //ct = color table, gct = global color table
      var ct = img.lctFlag ? img.lct : hdr.gct; // TODO: What if neither exists?

      /*
        Disposal method indicates the way in which the graphic is to
        be treated after being displayed.

        Values :    0 - No disposal specified. The decoder is not required to take any action.
                    1 - Do not dispose. The graphic is to be left in place.
                    2 - Restore to background color. The area used by the graphic must be restored
                        to the background color.
                    3 - Restore to previous. The decoder is required to restore the area overwritten
                        by the graphic with what was there prior to rendering the graphic.

                        Importantly, "previous" means the frame state after the last disposal of
                        method 0, 1, or 2.
            */
      if (currIdx > 0) {
        if (lastDisposalMethod === 3) {
          // Restore to previous
          // If we disposed every frame including first frame up to this point, then we have
          // no composited frame to restore to. In this case, restore to background instead.
          if (disposalRestoreFromIdx !== null) {
            frame.putImageData(frames[disposalRestoreFromIdx].data, 0, 0);
          } else {
            frame.clearRect(lastImg.leftPos, lastImg.topPos, lastImg.width, lastImg.height);
          }
        } else {
          disposalRestoreFromIdx = currIdx - 1;
        }

        if (lastDisposalMethod === 2) {
          // Restore to background color
          // Browser implementations historically restore to transparent; we do the same.
          // http://www.wizards-toolkit.org/discourse-server/viewtopic.php?f=1&t=21172#p86079
          frame.clearRect(lastImg.leftPos, lastImg.topPos, lastImg.width, lastImg.height);
        }
      }
      // else, Undefined/Do not dispose.
      // frame contains final pixel data from the last frame; do nothing

      //Get existing pixels for img region after applying disposal method
      const imgData = frame.getImageData(img.leftPos, img.topPos, img.width, img.height);

      //apply color table colors
      img.pixels.forEach(function (pixel, i) {
        // imgData.data === [R,G,B,A,R,G,B,A,...]
        if (pixel !== transparency) {
          imgData.data[i * 4 + 0] = ct[pixel][0];
          imgData.data[i * 4 + 1] = ct[pixel][1];
          imgData.data[i * 4 + 2] = ct[pixel][2];
          imgData.data[i * 4 + 3] = 255; // Opaque.
        }
      });

      frame.putImageData(imgData, img.leftPos, img.topPos);

      lastImg = img;
    },
    eof: pushFrame,
  });

  return {
    width: hdr.width,
    height: hdr.height,
    frameCount: frames.length,
    getDelay: i => frames[i].delay,
    // scaleCanvas(canvas, max_width = 0) {
    //   const scale = max_width ? max_width / hdr.width : 1;
    //   canvas.width = w * scale;
    //   canvas.height = h * scale;
    //   canvas.getContext("2d").scale(scale, scale);
    // },
    drawFrame(ctx, i, x = 0, y = 0) {
      tmpCanvas.getContext("2d").putImageData(frames[i].data, x, y);

      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(tmpCanvas, 0, 0);
    },
  };
};
