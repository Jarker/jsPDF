/**
 * Creates new jsPDF document object instance.
 * @name jsPDF
 * @class
 * @param orientation {string/Object} Orientation of the first page. Possible values are "portrait" or "landscape" (or shortcuts "p" (Default), "l").<br />
 * Can also be an options object.
 * @param unit {string}  Measurement unit to be used when coordinates are specified.<br />
 * Possible values are "pt" (points), "mm" (Default), "cm", "in" or "px".
 * @param format {string/Array} The format of the first page. Can be:<ul><li>a0 - a10</li><li>b0 - b10</li><li>c0 - c10</li><li>dl</li><li>letter</li><li>government-letter</li><li>legal</li><li>junior-legal</li><li>ledger</li><li>tabloid</li><li>credit-card</li></ul><br />
 * Default is "a4". If you want to use your own format just pass instead of one of the above predefined formats the size as an number-array, e.g. [595.28, 841.89]
 * @returns {jsPDF} jsPDF-instance
 * @description
 * If the first parameter (orientation) is an object, it will be interpreted as an object of named parameters
 * ```
 * {
 *  orientation: 'p',
 *  unit: 'mm',
 *  format: 'a4',
 *  hotfixes: [] // an array of hotfix strings to enable
 * }
 * ```
 */
var jsPDF = (function (global) {
  'use strict';

  /**
   * jsPDF's Internal PubSub Implementation.
   * Backward compatible rewritten on 2014 by
   * Diego Casorran, https://github.com/diegocr
   *
   * @class
   * @name PubSub
   * @ignore
   */
  function PubSub(context) {
    if (typeof context !== 'object') {
      throw new Error('Invalid Context passed to initialize PubSub (jsPDF-module)');
    }
    var topics = {};

    this.subscribe = function (topic, callback, once) {
      once = once || false;
      if (typeof topic !== 'string' || typeof callback !== 'function' || typeof once !== 'boolean') {
        throw new Error('Invalid arguments passed to PubSub.subscribe (jsPDF-module)');
      }

      if (!topics.hasOwnProperty(topic)) {
        topics[topic] = {};
      }

      var token = Math.random().toString(35);
      topics[topic][token] = [callback, !!once];

      return token;
    };

    this.unsubscribe = function (token) {
      for (var topic in topics) {
        if (topics[topic][token]) {
          delete topics[topic][token];
          if (Object.keys(topics[topic]).length === 0) {
            delete topics[topic];
          }
          return true;
        }
      }
      return false;
    };

    this.publish = function (topic) {
      if (topics.hasOwnProperty(topic)) {
        var args = Array.prototype.slice.call(arguments, 1),
            tokens = [];

        for (var token in topics[topic]) {
          var sub = topics[topic][token];
          try {
            sub[0].apply(context, args);
          } catch (ex) {
            if (global.console) {
              console.error('jsPDF PubSub Error', ex.message, ex);
            }
          }
          if (sub[1]) tokens.push(token);
        }
        if (tokens.length) tokens.forEach(this.unsubscribe);
      }
    };

    this.getTopics = function () {
      return topics;
    }
  }

  /**
   * @constructor
   * @private
   */
  function jsPDF(orientation, unit, format, compressPdf) {
    var options = {};
    var filters = [];
    var userUnit = 1.0;
    var precision;

    if (typeof orientation === 'object') {
      options = orientation;

      orientation = options.orientation;
      unit = options.unit || unit;
      format = options.format || format;
      compressPdf = options.compress || options.compressPdf || compressPdf;
      filters = options.filters || ((compressPdf === true) ? ['FlateEncode'] : filters);
      userUnit = typeof options.userUnit === "number" ? Math.abs(options.userUnit) : 1.0;
      precision = options.precision;
    }

    unit = unit || 'mm';
    orientation = ('' + (orientation || 'P')).toLowerCase();
    var putOnlyUsedFonts = options.putOnlyUsedFonts || true;
    var usedFonts = {};

    var API = {
      internal: {},
      __private__: {}
    };

    API.__private__.PubSub = PubSub;

    var pdfVersion = '1.3';
    var getPdfVersion = API.__private__.getPdfVersion = function () {
      return pdfVersion;
    };

    var setPdfVersion = API.__private__.setPdfVersion = function (value) {
      pdfVersion = value;
    };

    // Size in pt of various paper formats
    const pageFormats = {
      'a0': [2383.94, 3370.39],
      'a1': [1683.78, 2383.94],
      'a2': [1190.55, 1683.78],
      'a3': [841.89, 1190.55],
      'a4': [595.28, 841.89],
      'a5': [419.53, 595.28],
      'a6': [297.64, 419.53],
      'a7': [209.76, 297.64],
      'a8': [147.40, 209.76],
      'a9': [104.88, 147.40],
      'a10': [73.70, 104.88],
      'b0': [2834.65, 4008.19],
      'b1': [2004.09, 2834.65],
      'b2': [1417.32, 2004.09],
      'b3': [1000.63, 1417.32],
      'b4': [708.66, 1000.63],
      'b5': [498.90, 708.66],
      'b6': [354.33, 498.90],
      'b7': [249.45, 354.33],
      'b8': [175.75, 249.45],
      'b9': [124.72, 175.75],
      'b10': [87.87, 124.72],
      'c0': [2599.37, 3676.54],
      'c1': [1836.85, 2599.37],
      'c2': [1298.27, 1836.85],
      'c3': [918.43, 1298.27],
      'c4': [649.13, 918.43],
      'c5': [459.21, 649.13],
      'c6': [323.15, 459.21],
      'c7': [229.61, 323.15],
      'c8': [161.57, 229.61],
      'c9': [113.39, 161.57],
      'c10': [79.37, 113.39],
      'dl': [311.81, 623.62],
      'letter': [612, 792],
      'government-letter': [576, 756],
      'legal': [612, 1008],
      'junior-legal': [576, 360],
      'ledger': [1224, 792],
      'tabloid': [792, 1224],
      'credit-card': [153, 243]
    };

    var getPageFormats = API.__private__.getPageFormats = function () {
      return pageFormats;
    };

    var getPageFormat = API.__private__.getPageFormat = function (value) {
      return pageFormats[value];
    };

    format = format || 'a4';

    var roundToPrecision = API.roundToPrecision = API.__private__.roundToPrecision = function (number, parmPrecision) {
      var tmpPrecision = precision || parmPrecision;
      if (isNaN(number) || isNaN(tmpPrecision)) {
        throw new Error('Invalid argument passed to jsPDF.roundToPrecision');
      }
      return number.toFixed(tmpPrecision);
    };

    var f2 = API.f2 = API.__private__.f2 = function (number) {
      if (isNaN(number)) {
        throw new Error('Invalid argument passed to jsPDF.f2');
      }
      return roundToPrecision(number, 2);
    };

    var f3 = API.__private__.f3 = function (number) {
      if (isNaN(number)) {
        throw new Error('Invalid argument passed to jsPDF.f3');
      }
      return roundToPrecision(number, 3);
    };

    var fileId = '00000000000000000000000000000000';

    var getFileId = API.__private__.getFileId = function () {
      return fileId;
    };

    var setFileId = API.__private__.setFileId = function (value) {
      value = value || ("12345678901234567890123456789012").split('').map(function () {
        return "ABCDEF0123456789".charAt(Math.floor(Math.random() * 16));
      }).join('');
      fileId = value;
      return fileId;
    };

    /**
     * @name setFileId
     * @memberOf jsPDF
     * @function
     * @instance
     * @param {string} value GUID.
     * @returns {jsPDF}
     */
    API.setFileId = function (value) {
      setFileId(value);
      return this;
    }

    /**
     * @name getFileId
     * @memberOf jsPDF
     * @function
     * @instance
     *
     * @returns {string} GUID.
     */
    API.getFileId = function () {
      return getFileId();
    }

    var creationDate;

    var convertDateToPDFDate = API.__private__.convertDateToPDFDate = function (parmDate) {
      var result = '';
      var tzoffset = parmDate.getTimezoneOffset(),
          tzsign = tzoffset < 0 ? '+' : '-',
          tzhour = Math.floor(Math.abs(tzoffset / 60)),
          tzmin = Math.abs(tzoffset % 60),
          timeZoneString = [tzsign, padd2(tzhour), "'", padd2(tzmin), "'"].join('');

      result = ['D:',
        parmDate.getFullYear(),
        padd2(parmDate.getMonth() + 1),
        padd2(parmDate.getDate()),
        padd2(parmDate.getHours()),
        padd2(parmDate.getMinutes()),
        padd2(parmDate.getSeconds()),
        timeZoneString
      ].join('');
      return result;
    };

    var convertPDFDateToDate = API.__private__.convertPDFDateToDate = function (parmPDFDate) {
      var year = parseInt(parmPDFDate.substr(2, 4), 10);
      var month = parseInt(parmPDFDate.substr(6, 2), 10) - 1;
      var date = parseInt(parmPDFDate.substr(8, 2), 10);
      var hour = parseInt(parmPDFDate.substr(10, 2), 10);
      var minutes = parseInt(parmPDFDate.substr(12, 2), 10);
      var seconds = parseInt(parmPDFDate.substr(14, 2), 10);
      var timeZoneHour = parseInt(parmPDFDate.substr(16, 2), 10);
      var timeZoneMinutes = parseInt(parmPDFDate.substr(20, 2), 10);

      var resultingDate = new Date(year, month, date, hour, minutes, seconds, 0);
      return resultingDate;
    };

    var setCreationDate = API.__private__.setCreationDate = function (date) {
      var tmpCreationDateString;
      var regexPDFCreationDate = (/^D:(20[0-2][0-9]|203[0-7]|19[7-9][0-9])(0[0-9]|1[0-2])([0-2][0-9]|3[0-1])(0[0-9]|1[0-9]|2[0-3])(0[0-9]|[1-5][0-9])(0[0-9]|[1-5][0-9])(\+0[0-9]|\+1[0-4]|\-0[0-9]|\-1[0-1])\'(0[0-9]|[1-5][0-9])\'?$/);
      if (typeof (date) === "undefined") {
        date = new Date();
      }

      if (typeof date === "object" && Object.prototype.toString.call(date) === "[object Date]") {
        tmpCreationDateString = convertDateToPDFDate(date)
      } else if (regexPDFCreationDate.test(date)) {
        tmpCreationDateString = date;
      } else {
        throw new Error('Invalid argument passed to jsPDF.setCreationDate');
      }
      creationDate = tmpCreationDateString;
      return creationDate;
    };

    var getCreationDate = API.__private__.getCreationDate = function (type) {
      var result = creationDate;
      if (type === "jsDate") {
        result = convertPDFDateToDate(creationDate);
      }
      return result;
    };

    /**
     * @name setCreationDate
     * @memberOf jsPDF
     * @function
     * @instance
     * @param {Object} date
     * @returns {jsPDF}
     */
    API.setCreationDate = function (date) {
      setCreationDate(date);
      return this;
    }

    /**
     * @name getCreationDate
     * @memberOf jsPDF
     * @function
     * @instance
     * @param {Object} type
     * @returns {Object}
     */
    API.getCreationDate = function (type) {
      return getCreationDate(type);
    }

    var padd2 = API.__private__.padd2 = function (number) {
      return ('0' + parseInt(number)).slice(-2);
    };

    var outToPages = !1; // switches where out() prints. outToPages true = push to pages obj. outToPages false = doc builder content
    var pages = [];

    var content = [];
    var currentPage;
    var content_length = 0;
    var customOutputDestination;

    var setOutputDestination = API.__private__.setCustomOutputDestination = function (destination) {
      customOutputDestination = destination;
    };

    var resetOutputDestination = API.__private__.resetCustomOutputDestination = function (destination) {
      customOutputDestination = undefined;
    };

    var out = API.__private__.out = function (string) {
      var writeArray;
      string = (typeof string === "string") ? string : string.toString();
      if (typeof customOutputDestination === "undefined") {
        writeArray = ((outToPages) ? pages[currentPage] : content);
      } else {
        writeArray = customOutputDestination;
      }

      writeArray.push(string);

      if (!outToPages) {
        content_length += string.length + 1;
      }
      return writeArray;
    };

    var write = API.__private__.write = function (value) {
      return out(arguments.length === 1 ? value.toString() : Array.prototype.join.call(arguments, ' '));
    };

    var getArrayBuffer = API.__private__.getArrayBuffer = function (data) {
      var len = data.length,
          ab = new ArrayBuffer(len),
          u8 = new Uint8Array(ab);

      while (len--) u8[len] = data.charCodeAt(len);
      return ab;
    };

    var standardFonts = [
      ['Helvetica', "helvetica", "normal", 'WinAnsiEncoding'],
      ['Helvetica-Bold', "helvetica", "bold", 'WinAnsiEncoding'],
      ['Helvetica-Oblique', "helvetica", "italic", 'WinAnsiEncoding'],
      ['Helvetica-BoldOblique', "helvetica", "bolditalic", 'WinAnsiEncoding'],
      ['Courier', "courier", "normal", 'WinAnsiEncoding'],
      ['Courier-Bold', "courier", "bold", 'WinAnsiEncoding'],
      ['Courier-Oblique', "courier", "italic", 'WinAnsiEncoding'],
      ['Courier-BoldOblique', "courier", "bolditalic", 'WinAnsiEncoding'],
      ['Times-Roman', "times", "normal", 'WinAnsiEncoding'],
      ['Times-Bold', "times", "bold", 'WinAnsiEncoding'],
      ['Times-Italic', "times", "italic", 'WinAnsiEncoding'],
      ['Times-BoldItalic', "times", "bolditalic", 'WinAnsiEncoding'],
      ['ZapfDingbats', "zapfdingbats", "normal", null],
      ['Symbol', "symbol", "normal", null]
    ];

    var getStandardFonts = API.__private__.getStandardFonts = function (data) {
      return standardFonts;
    };

    var activeFontSize = options.fontSize || 16;

    /**
     * Sets font size for upcoming text elements.
     *
     * @param {number} size Font size in points.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setFontSize
     */
    var setFontSize = API.__private__.setFontSize = API.setFontSize = function (size) {
      activeFontSize = size;
      return this;
    };

    /**
     * Gets the fontsize for upcoming text elements.
     *
     * @function
     * @instance
     * @returns {number}
     * @memberOf jsPDF
     * @name getFontSize
     */
    var getFontSize = API.__private__.getFontSize = API.getFontSize = function () {
      return activeFontSize;
    };


    var R2L = options.R2L || false;

    /**
     * Set value of R2L functionality.
     *
     * @param {boolean} value
     * @function
     * @instance
     * @returns {jsPDF} jsPDF-instance
     * @memberOf jsPDF
     * @name setR2L
     */
    var setR2L = API.__private__.setR2L = API.setR2L = function (value) {
      R2L = value;
      return this;
    };

    /**
     * Get value of R2L functionality.
     *
     * @function
     * @instance
     * @returns {boolean} jsPDF-instance
     * @memberOf jsPDF
     * @name getR2L
     */
    var getR2L = API.__private__.getR2L = API.getR2L = function (value) {
      return R2L;
    };

    var zoomMode; // default: 1;

    var setZoomMode = API.__private__.setZoomMode = function (zoom) {
      var validZoomModes = [undefined, null, 'fullwidth', 'fullheight', 'fullpage', 'original'];

      if (/^\d*\.?\d*\%$/.test(zoom)) {
        zoomMode = zoom;
      } else if (!isNaN(zoom)) {
        zoomMode = parseInt(zoom, 10);
      } else if (validZoomModes.indexOf(zoom) !== -1) {
        zoomMode = zoom
      } else {
        throw new Error('zoom must be Integer (e.g. 2), a percentage Value (e.g. 300%) or fullwidth, fullheight, fullpage, original. "' + zoom + '" is not recognized.')
      }
    }

    var getZoomMode = API.__private__.getZoomMode = function () {
      return zoomMode;
    }

    var pageMode; // default: 'UseOutlines';
    var setPageMode = API.__private__.setPageMode = function (pmode) {
      var validPageModes = [undefined, null, 'UseNone', 'UseOutlines', 'UseThumbs', 'FullScreen'];

      if (validPageModes.indexOf(pmode) == -1) {
        throw new Error('Page mode must be one of UseNone, UseOutlines, UseThumbs, or FullScreen. "' + pmode + '" is not recognized.')
      }
      pageMode = pmode;
    }

    var getPageMode = API.__private__.getPageMode = function () {
      return pageMode;
    }

    var layoutMode; // default: 'continuous';
    var setLayoutMode = API.__private__.setLayoutMode = function (layout) {
      var validLayoutModes = [undefined, null, 'continuous', 'single', 'twoleft', 'tworight', 'two'];

      if (validLayoutModes.indexOf(layout) == -1) {
        throw new Error('Layout mode must be one of continuous, single, twoleft, tworight. "' + layout + '" is not recognized.')
      }
      layoutMode = layout;
    }

    var getLayoutMode = API.__private__.getLayoutMode = function () {
      return layoutMode;
    }

    /**
     * Set the display mode options of the page like zoom and layout.
     *
     * @name setDisplayMode
     * @memberOf jsPDF
     * @function
     * @instance
     * @param {integer|String} zoom   You can pass an integer or percentage as
     * a string. 2 will scale the document up 2x, '200%' will scale up by the
     * same amount. You can also set it to 'fullwidth', 'fullheight',
     * 'fullpage', or 'original'.
     *
     * Only certain PDF readers support this, such as Adobe Acrobat.
     *
     * @param {string} layout Layout mode can be: 'continuous' - this is the
     * default continuous scroll. 'single' - the single page mode only shows one
     * page at a time. 'twoleft' - two column left mode, first page starts on
     * the left, and 'tworight' - pages are laid out in two columns, with the
     * first page on the right. This would be used for books.
     * @param {string} pmode 'UseOutlines' - it shows the
     * outline of the document on the left. 'UseThumbs' - shows thumbnails along
     * the left. 'FullScreen' - prompts the user to enter fullscreen mode.
     *
     * @returns {jsPDF}
     */
    var setDisplayMode = API.__private__.setDisplayMode = API.setDisplayMode = function (zoom, layout, pmode) {
      setZoomMode(zoom);
      setLayoutMode(layout);
      setPageMode(pmode);
      return this;
    };

    var documentProperties = {
      'title': '',
      'subject': '',
      'author': '',
      'keywords': '',
      'creator': ''
    };

    var getDocumentProperty = API.__private__.getDocumentProperty = function (key) {
      if (Object.keys(documentProperties).indexOf(key) === -1) {
        throw new Error('Invalid argument passed to jsPDF.getDocumentProperty');
      }
      return documentProperties[key];
    };

    var getDocumentProperties = API.__private__.getDocumentProperties = function (properties) {
      return documentProperties;
    };

    /**
     * Adds a properties to the PDF document.
     *
     * @param {Object} A property_name-to-property_value object structure.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setDocumentProperties
     */
    var setDocumentProperties = API.__private__.setDocumentProperties = API.setProperties = API.setDocumentProperties = function (properties) {
      // copying only those properties we can render.
      for (var property in documentProperties) {
        if (documentProperties.hasOwnProperty(property) && properties[
            property]) {
          documentProperties[property] = properties[property];
        }
      }
      return this;
    };

    var setDocumentProperty = API.__private__.setDocumentProperty = function (key, value) {
      if (Object.keys(documentProperties).indexOf(key) === -1) {
        throw new Error('Invalid arguments passed to jsPDF.setDocumentProperty');
      }
      return documentProperties[key] = value;
    };

    var objectNumber = 0; // 'n' Current object number
    var offsets = []; // List of offsets. Activated and reset by buildDocument(). Pupulated by various calls buildDocument makes.
    var fonts = {}; // collection of font objects, where key is fontKey - a dynamically created label for a given font.
    var fontmap = {}; // mapping structure fontName > fontStyle > font key - performance layer. See addFont()
    var activeFontKey; // will be string representing the KEY of the font as combination of fontName + fontStyle
    var k; // Scale factor
    var page = 0;
    var pagesContext = [];
    var additionalObjects = [];
    var events = new PubSub(API);
    var hotfixes = options.hotfixes || [];
    var newObject = API.__private__.newObject = function () {
      var oid = newObjectDeferred();
      newObjectDeferredBegin(oid, true);
      return oid;
    };

    // Does not output the object.  The caller must call newObjectDeferredBegin(oid) before outputing any data
    var newObjectDeferred = API.__private__.newObjectDeferred = function () {
      objectNumber++;
      offsets[objectNumber] = function () {
        return content_length;
      };
      return objectNumber;
    };

    var newObjectDeferredBegin = function (oid, doOutput) {
      doOutput = typeof (doOutput) === 'boolean' ? doOutput : false;
      offsets[oid] = content_length;
      if (doOutput) {
        out(oid + ' 0 obj');
      }
      return oid;
    };
    // Does not output the object until after the pages have been output.
    // Returns an object containing the objectId and content.
    // All pages have been added so the object ID can be estimated to start right after.
    // This does not modify the current objectNumber;  It must be updated after the newObjects are output.
    var newAdditionalObject = API.__private__.newAdditionalObject = function () {
      var objId = newObjectDeferred();
      var obj = {
        objId: objId,
        content: ''
      };
      additionalObjects.push(obj);
      return obj;
    };

    var rootDictionaryObjId = newObjectDeferred();
    var resourceDictionaryObjId = newObjectDeferred();

    /////////////////////
    // Private functions
    /////////////////////

    var decodeColorString = API.__private__.decodeColorString = function (color) {
      var colorEncoded = color.split(' ');
      if (colorEncoded.length === 2 && (colorEncoded[1] === 'g' || colorEncoded[1] === 'G')) {
        // convert grayscale value to rgb so that it can be converted to hex for consistency
        var floatVal = parseFloat(colorEncoded[0]);
        colorEncoded = [floatVal, floatVal, floatVal, 'r'];
      }
      var colorAsRGB = '#';
      for (var i = 0; i < 3; i++) {
        colorAsRGB += ('0' + Math.floor(parseFloat(colorEncoded[i]) * 255).toString(16)).slice(-2);
      }
      return colorAsRGB;
    }
    var encodeColorString = API.__private__.encodeColorString = function (options) {
      var color;

      if (typeof options === "string") {
        options = {
          ch1: options
        };
      }
      var ch1 = options.ch1;
      var ch2 = options.ch2;
      var ch3 = options.ch3;
      var ch4 = options.ch4;
      var precision = options.precision;
      var letterArray = (options.pdfColorType === "draw") ? ['G', 'RG', 'K'] : ['g', 'rg', 'k'];

      if ((typeof ch1 === "string") && ch1.charAt(0) !== '#') {
        var rgbColor = new RGBColor(ch1);
        if (rgbColor.ok) {
          ch1 = rgbColor.toHex();
        } else if (!(/^\d*\.?\d*$/.test(ch1))) {
          throw new Error('Invalid color "' + ch1 + '" passed to jsPDF.encodeColorString.');
        }
      }
      //convert short rgb to long form
      if ((typeof ch1 === "string") && (/^#[0-9A-Fa-f]{3}$/).test(ch1)) {
        ch1 = '#' + ch1[1] + ch1[1] + ch1[2] + ch1[2] + ch1[3] + ch1[3];
      }

      if ((typeof ch1 === "string") && (/^#[0-9A-Fa-f]{6}$/).test(ch1)) {
        var hex = parseInt(ch1.substr(1), 16);
        ch1 = (hex >> 16) & 255;
        ch2 = (hex >> 8) & 255;
        ch3 = (hex & 255);
      }

      if ((typeof ch2 === "undefined") || ((typeof ch4 === "undefined") && (ch1 === ch2) && (ch2 === ch3))) {
        // Gray color space.
        if (typeof ch1 === "string") {
          color = ch1 + " " + letterArray[0];
        } else {
          switch (options.precision) {
            case 2:
              color = f2(ch1 / 255) + " " + letterArray[0];
              break;
            case 3:
            default:
              color = f3(ch1 / 255) + " " + letterArray[0];
          }
        }
      } else if (typeof ch4 === "undefined" || typeof ch4 === "object") {
        // assume RGBA
        if (ch4 && !isNaN(ch4.a)) {
          //TODO Implement transparency.
          //WORKAROUND use white for now, if transparent, otherwise handle as rgb
          if (ch4.a === 0) {
            color = ['1.000', '1.000', '1.000', letterArray[1]].join(" ");
            return color;
          }
        }
        // assume RGB
        if (typeof ch1 === "string") {
          color = [ch1, ch2, ch3, letterArray[1]].join(" ");
        } else {
          switch (options.precision) {
            case 2:
              color = [f2(ch1 / 255), f2(ch2 / 255), f2(ch3 / 255), letterArray[1]].join(" ");
              break;
            default:
            case 3:
              color = [f3(ch1 / 255), f3(ch2 / 255), f3(ch3 / 255), letterArray[1]].join(" ");
          }
        }
      } else {
        // assume CMYK
        if (typeof ch1 === 'string') {
          color = [ch1, ch2, ch3, ch4, letterArray[2]].join(" ");
        } else {
          switch (options.precision) {
            case 2:
              color = [f2(ch1 / 255), f2(ch2 / 255), f2(ch3 / 255), f2(ch4 / 255), letterArray[2]].join(" ");
              break;
            case 3:
            default:
              color = [f3(ch1 / 255), f3(ch2 / 255), f3(ch3 / 255), f3(ch4 / 255), letterArray[2]].join(" ");
          }
        }
      }
      return color;
    };

    var getFilters = API.__private__.getFilters = function () {
      return filters;
    };

    var putStream = API.__private__.putStream = function (options) {
      options = options || {};
      var data = options.data || '';
      var filters = options.filters || getFilters();
      var alreadyAppliedFilters = options.alreadyAppliedFilters || [];
      var addLength1 = options.addLength1 || false;
      var valueOfLength1 = data.length;

      var processedData = {};
      if (filters === true) {
        filters = ['FlateEncode'];
      }
      var keyValues = options.additionalKeyValues || [];
      if (typeof jsPDF.API.processDataByFilters !== 'undefined') {
        processedData = jsPDF.API.processDataByFilters(data, filters);
      } else {
        processedData = {data: data, reverseChain : []}
      }
      var filterAsString = processedData.reverseChain + ((Array.isArray(alreadyAppliedFilters)) ? alreadyAppliedFilters.join(' ') : alreadyAppliedFilters.toString());

      if (processedData.data.length !== 0) {
        keyValues.push({
          key: 'Length',
          value: processedData.data.length
        });
        if (addLength1 === true) {
          keyValues.push({
            key: 'Length1',
            value: valueOfLength1
          });
        }
      }

      if (filterAsString.length != 0) {
        //if (filters.length === 0 && alreadyAppliedFilters.length === 1 && typeof alreadyAppliedFilters !== "undefined") {
        if ((filterAsString.split('/').length - 1 === 1)) {
          keyValues.push({
            key: 'Filter',
            value: filterAsString
          });
        } else {
          keyValues.push({
            key: 'Filter',
            value: '[' + filterAsString + ']'
          });
        }
      }

      out('<<');
      for (var i = 0; i < keyValues.length; i++) {
        out('/' + keyValues[i].key + ' ' + keyValues[i].value);
      }
      out('>>');
      if (processedData.data.length !== 0) {
        out('stream');
        out(processedData.data);
        out('endstream');
      }
    };

    var putPage = API.__private__.putPage = function (page) {
      var mediaBox = page.mediaBox;
      var pageNumber = page.number;
      var data = page.data;
      var pageObjectNumber = page.objId;
      var pageContentsObjId = page.contentsObjId;

      newObjectDeferredBegin(pageObjectNumber, true);
      var wPt = pagesContext[currentPage].mediaBox.topRightX - pagesContext[currentPage].mediaBox.bottomLeftX;
      var hPt = pagesContext[currentPage].mediaBox.topRightY - pagesContext[currentPage].mediaBox.bottomLeftY;
      out('<</Type /Page');
      out('/Parent ' + page.rootDictionaryObjId + ' 0 R');
      out('/Resources ' + page.resourceDictionaryObjId + ' 0 R');
      out('/MediaBox [' + parseFloat(f2(page.mediaBox.bottomLeftX)) + ' ' + parseFloat(f2(page.mediaBox.bottomLeftY)) + ' ' + f2(page.mediaBox.topRightX) + ' ' + f2(page.mediaBox.topRightY) + ']');
      if (page.cropBox !== null) {
        out('/CropBox [' + f2(page.cropBox.bottomLeftX) + ' ' + f2(page.cropBox.bottomLeftY) + ' ' + f2(page.cropBox.topRightX) + ' ' + f2(page.cropBox.topRightY) + ']');
      }

      if (page.bleedBox !== null) {
        out('/BleedBox [' + f2(page.bleedBox.bottomLeftX) + ' ' + f2(page.bleedBox.bottomLeftY) + ' ' + f2(page.bleedBox.topRightX) + ' ' + f2(page.bleedBox.topRightY) + ']');
      }

      if (page.trimBox !== null) {
        out('/TrimBox [' + f2(page.trimBox.bottomLeftX) + ' ' + f2(page.trimBox.bottomLeftY) + ' ' + f2(page.trimBox.topRightX) + ' ' + f2(page.trimBox.topRightY) + ']');
      }

      if (page.artBox !== null) {
        out('/ArtBox [' + f2(page.artBox.bottomLeftX) + ' ' + f2(page.artBox.bottomLeftY) + ' ' + f2(page.artBox.topRightX) + ' ' + f2(page.artBox.topRightY) + ']');
      }

      if (typeof page.userUnit === "number" && page.userUnit !== 1.0) {
        out('/UserUnit ' + page.userUnit);
      }

      events.publish('putPage', {
        objId : pageObjectNumber,
        pageContext: pagesContext[pageNumber],
        pageNumber: pageNumber,
        page: data
      });
      out('/Contents ' + pageContentsObjId + ' 0 R');
      out('>>');
      out('endobj');
      // Page content
      var pageContent = data.join('\n');
      newObjectDeferredBegin(pageContentsObjId, true);
      putStream({
        data: pageContent,
        filters: getFilters()
      });
      out('endobj');
      return pageObjectNumber;
    }
    var putPages = API.__private__.putPages = function () {
      var n, p, i, pageObjectNumbers = [];

      for (n = 1; n <= page; n++) {
        pagesContext[n].objId = newObjectDeferred();
        pagesContext[n].contentsObjId = newObjectDeferred();
      }

      for (n = 1; n <= page; n++) {
        pageObjectNumbers.push(putPage({
          number: n,
          data: pages[n],
          objId: pagesContext[n].objId,
          contentsObjId: pagesContext[n].contentsObjId,
          mediaBox: pagesContext[n].mediaBox,
          cropBox: pagesContext[n].cropBox,
          bleedBox: pagesContext[n].bleedBox,
          trimBox: pagesContext[n].trimBox,
          artBox: pagesContext[n].artBox,
          userUnit: pagesContext[n].userUnit,
          rootDictionaryObjId: rootDictionaryObjId,
          resourceDictionaryObjId: resourceDictionaryObjId
        }));
      }
      newObjectDeferredBegin(rootDictionaryObjId, true);
      out('<</Type /Pages');
      var kids = '/Kids [';
      for (i = 0; i < page; i++) {
        kids += pageObjectNumbers[i] + ' 0 R ';
      }
      out(kids + ']');
      out('/Count ' + page);
      out('>>');
      out('endobj');
      events.publish('postPutPages');
    };

    var putFont = function (font) {
      events.publish('putFont', {
        font: font,
        out: out,
        newObject: newObject,
        putStream: putStream
      });
      if (font.isAlreadyPutted !== true) {
        font.objectNumber = newObject();
        out('<<');
        out('/Type /Font');
        out('/BaseFont /' + font.postScriptName)
        out('/Subtype /Type1');
        if (typeof font.encoding === 'string') {
          out('/Encoding /' + font.encoding);
        }
        out('/FirstChar 32');
        out('/LastChar 255');
        out('>>');
        out('endobj');
      }
    };

    var putFonts = function () {
      for (var fontKey in fonts) {
        if (fonts.hasOwnProperty(fontKey)) {
          if (putOnlyUsedFonts === false || (putOnlyUsedFonts === true && usedFonts.hasOwnProperty(fontKey))) {
            putFont(fonts[fontKey]);
          }
        }
      }
    };

    var putResourceDictionary = function () {
      out('/ProcSet [/PDF /Text /ImageB /ImageC /ImageI]');
      out('/Font <<');

      // Do this for each font, the '1' bit is the index of the font
      for (var fontKey in fonts) {
        if (fonts.hasOwnProperty(fontKey)) {
          if (putOnlyUsedFonts === false || (putOnlyUsedFonts === true && usedFonts.hasOwnProperty(fontKey))) {
            out('/' + fontKey + ' ' + fonts[fontKey].objectNumber + ' 0 R');
          }
        }
      }
      out('>>');
      out('/XObject <<');
      events.publish('putXobjectDict');
      out('>>');
    };

    var putResources = function () {
      putFonts();
      events.publish('putResources');
      newObjectDeferredBegin(resourceDictionaryObjId, true);
      out('<<');
      putResourceDictionary();
      out('>>');
      out('endobj');
      events.publish('postPutResources');
    };

    var putAdditionalObjects = function () {
      events.publish('putAdditionalObjects');
      for (var i = 0; i < additionalObjects.length; i++) {
        var obj = additionalObjects[i];
        newObjectDeferredBegin(obj.objId, true);
        out(obj.content);
        out('endobj');
      }
      events.publish('postPutAdditionalObjects');
    };

    var addToFontDictionary = function (fontKey, fontName, fontStyle) {
      // this is mapping structure for quick font key lookup.
      // returns the KEY of the font (ex: "F1") for a given
      // pair of font name and type (ex: "Arial". "Italic")
      if (!fontmap.hasOwnProperty(fontName)) {
        fontmap[fontName] = {};
      }
      fontmap[fontName][fontStyle] = fontKey;
    };
    var addFont = function (postScriptName, fontName, fontStyle, encoding, isStandardFont) {
      isStandardFont = isStandardFont || false;
      var fontKey = 'F' + (Object.keys(fonts).length + 1).toString(10),
          // This is FontObject
          font = {
            'id': fontKey,
            'postScriptName': postScriptName,
            'fontName': fontName,
            'fontStyle': fontStyle,
            'encoding': encoding,
            'isStandardFont': isStandardFont,
            'metadata': {}
          };
      var instance = this;

      events.publish('addFont', {
        font: font,
        instance: instance
      });

      if (fontKey !== undefined) {
        fonts[fontKey] = font;
        addToFontDictionary(fontKey, fontName, fontStyle);
      }
      return fontKey;
    };

    var addFonts = function (arrayOfFonts) {
      for (var i = 0, l = standardFonts.length; i < l; i++) {
        var fontKey = addFont(
            arrayOfFonts[i][0],
            arrayOfFonts[i][1],
            arrayOfFonts[i][2],
            standardFonts[i][3],
            true);

        usedFonts[fontKey] = true;
        // adding aliases for standard fonts, this time matching the capitalization
        var parts = arrayOfFonts[i][0].split('-');
        addToFontDictionary(fontKey, parts[0], parts[1] || '');
      }
      events.publish('addFonts', {
        fonts: fonts,
        dictionary: fontmap
      });
    };

    var SAFE = function __safeCall(fn) {
      fn.foo = function __safeCallWrapper() {
        try {
          return fn.apply(this, arguments);
        } catch (e) {
          var stack = e.stack || '';
          if (~stack.indexOf(' at ')) stack = stack.split(" at ")[1];
          var m = "Error in function " + stack.split("\n")[0].split('<')[
              0] + ": " + e.message;
          if (global.console) {
            global.console.error(m, e);
            if (global.alert) alert(m);
          } else {
            throw new Error(m);
          }
        }
      };
      fn.foo.bar = fn;
      return fn.foo;
    };

    var to8bitStream = function (text, flags) {
      /**
       * PDF 1.3 spec:
       * "For text strings encoded in Unicode, the first two bytes must be 254 followed by
       * 255, representing the Unicode byte order marker, U+FEFF. (This sequence conflicts
       * with the PDFDocEncoding character sequence thorn ydieresis, which is unlikely
       * to be a meaningful beginning of a word or phrase.) The remainder of the
       * string consists of Unicode character codes, according to the UTF-16 encoding
       * specified in the Unicode standard, version 2.0. Commonly used Unicode values
       * are represented as 2 bytes per character, with the high-order byte appearing first
       * in the string."
       *
       * In other words, if there are chars in a string with char code above 255, we
       * recode the string to UCS2 BE - string doubles in length and BOM is prepended.
       *
       * HOWEVER!
       * Actual *content* (body) text (as opposed to strings used in document properties etc)
       * does NOT expect BOM. There, it is treated as a literal GID (Glyph ID)
       *
       * Because of Adobe's focus on "you subset your fonts!" you are not supposed to have
       * a font that maps directly Unicode (UCS2 / UTF16BE) code to font GID, but you could
       * fudge it with "Identity-H" encoding and custom CIDtoGID map that mimics Unicode
       * code page. There, however, all characters in the stream are treated as GIDs,
       * including BOM, which is the reason we need to skip BOM in content text (i.e. that
       * that is tied to a font).
       *
       * To signal this "special" PDFEscape / to8bitStream handling mode,
       * API.text() function sets (unless you overwrite it with manual values
       * given to API.text(.., flags) )
       * flags.autoencode = true
       * flags.noBOM = true
       *
       * ===================================================================================
       * `flags` properties relied upon:
       *   .sourceEncoding = string with encoding label.
       *                     "Unicode" by default. = encoding of the incoming text.
       *                     pass some non-existing encoding name
       *                     (ex: 'Do not touch my strings! I know what I am doing.')
       *                     to make encoding code skip the encoding step.
       *   .outputEncoding = Either valid PDF encoding name
       *                     (must be supported by jsPDF font metrics, otherwise no encoding)
       *                     or a JS object, where key = sourceCharCode, value = outputCharCode
       *                     missing keys will be treated as: sourceCharCode === outputCharCode
       *   .noBOM
       *       See comment higher above for explanation for why this is important
       *   .autoencode
       *       See comment higher above for explanation for why this is important
       */

      var i, l, sourceEncoding, encodingBlock, outputEncoding, newtext,
          isUnicode, ch, bch;

      flags = flags || {};
      sourceEncoding = flags.sourceEncoding || 'Unicode';
      outputEncoding = flags.outputEncoding;

      // This 'encoding' section relies on font metrics format
      // attached to font objects by, among others,
      // "Willow Systems' standard_font_metrics plugin"
      // see jspdf.plugin.standard_font_metrics.js for format
      // of the font.metadata.encoding Object.
      // It should be something like
      //   .encoding = {'codePages':['WinANSI....'], 'WinANSI...':{code:code, ...}}
      //   .widths = {0:width, code:width, ..., 'fof':divisor}
      //   .kerning = {code:{previous_char_code:shift, ..., 'fof':-divisor},...}
      if ((flags.autoencode || outputEncoding) &&
          fonts[activeFontKey].metadata &&
          fonts[activeFontKey].metadata[sourceEncoding] &&
          fonts[activeFontKey].metadata[sourceEncoding].encoding) {
        encodingBlock = fonts[activeFontKey].metadata[sourceEncoding].encoding;

        // each font has default encoding. Some have it clearly defined.
        if (!outputEncoding && fonts[activeFontKey].encoding) {
          outputEncoding = fonts[activeFontKey].encoding;
        }

        // Hmmm, the above did not work? Let's try again, in different place.
        if (!outputEncoding && encodingBlock.codePages) {
          outputEncoding = encodingBlock.codePages[0]; // let's say, first one is the default
        }

        if (typeof outputEncoding === 'string') {
          outputEncoding = encodingBlock[outputEncoding];
        }
        // we want output encoding to be a JS Object, where
        // key = sourceEncoding's character code and
        // value = outputEncoding's character code.
        if (outputEncoding) {
          isUnicode = false;
          newtext = [];
          for (i = 0, l = text.length; i < l; i++) {
            ch = outputEncoding[text.charCodeAt(i)];
            if (ch) {
              newtext.push(
                  String.fromCharCode(ch));
            } else {
              newtext.push(
                  text[i]);
            }

            // since we are looping over chars anyway, might as well
            // check for residual unicodeness
            if (newtext[i].charCodeAt(0) >> 8) {
              /* more than 255 */
              isUnicode = true;
            }
          }
          text = newtext.join('');
        }
      }

      i = text.length;
      // isUnicode may be set to false above. Hence the triple-equal to undefined
      while (isUnicode === undefined && i !== 0) {
        if (text.charCodeAt(i - 1) >> 8) {
          /* more than 255 */
          isUnicode = true;
        }
        i--;
      }
      if (!isUnicode) {
        return text;
      }

      newtext = flags.noBOM ? [] : [254, 255];
      for (i = 0, l = text.length; i < l; i++) {
        ch = text.charCodeAt(i);
        bch = ch >> 8; // divide by 256
        if (bch >> 8) {
          /* something left after dividing by 256 second time */
          throw new Error("Character at position " + i + " of string '" +
              text + "' exceeds 16bits. Cannot be encoded into UCS-2 BE");
        }
        newtext.push(bch);
        newtext.push(ch - (bch << 8));
      }
      return String.fromCharCode.apply(undefined, newtext);
    };

    var pdfEscape = API.__private__.pdfEscape = API.pdfEscape = function (text, flags) {
      /**
       * Replace '/', '(', and ')' with pdf-safe versions
       *
       * Doing to8bitStream does NOT make this PDF display unicode text. For that
       * we also need to reference a unicode font and embed it - royal pain in the rear.
       *
       * There is still a benefit to to8bitStream - PDF simply cannot handle 16bit chars,
       * which JavaScript Strings are happy to provide. So, while we still cannot display
       * 2-byte characters property, at least CONDITIONALLY converting (entire string containing)
       * 16bit chars to (USC-2-BE) 2-bytes per char + BOM streams we ensure that entire PDF
       * is still parseable.
       * This will allow immediate support for unicode in document properties strings.
       */
      return to8bitStream(text, flags).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    };

    var beginPage = API.__private__.beginPage = function (parmFormat, parmOrientation) {
      var tmp, width, height;

      if (typeof parmFormat === 'string') {
        if (tmp = getPageFormat(parmFormat.toLowerCase())) {
          width = tmp[0];
          height = tmp[1];
        }
      }
      if (Array.isArray(parmFormat)) {
        width = parmFormat[0] * k;
        height = parmFormat[1] * k;
      }
      if (isNaN(width)) {
        width = format[0];
        height = format[1];
      }

      if (parmOrientation) {
        switch (parmOrientation.substr(0, 1)) {
          case 'l':
            if (height > width) orientation = 's';
            break;
          case 'p':
            if (width > height) orientation = 's';
            break;
        }
        if (orientation === 's') {
          tmp = width;
          width = height;
          height = tmp;
        }
      }

      if (width > 14400 || height > 14400) {
        console.warn('A page in a PDF can not be wider or taller than 14400 userUnit. jsPDF limits the width/height to 14400');
        width = Math.min(14400, width);
        height = Math.min(14400, height);
      }

      format = [width, height];
      outToPages = true;
      pages[++page] = [];
      pagesContext[page] = {
        objId: 0,
        contentsObjId: 0,
        userUnit : Number(userUnit),
        artBox: null,
        bleedBox: null,
        cropBox: null,
        trimBox: null,
        mediaBox: {
          bottomLeftX: 0,
          bottomLeftY: 0,
          topRightX: Number(width),
          topRightY: Number(height)
        }
      };
      _setPage(page);
    };

    var _addPage = function () {
      beginPage.apply(this, arguments);
      // Set line width
      setLineWidth(lineWidth);
      // Set draw color
      out(strokeColor);
      // resurrecting non-default line caps, joins
      if (lineCapID !== 0) {
        out(lineCapID + ' J');
      }
      if (lineJoinID !== 0) {
        out(lineJoinID + ' j');
      }
      events.publish('addPage', {
        pageNumber: page
      });
    };

    var _deletePage = function (n) {
      if (n > 0 && n <= page) {
        pages.splice(n, 1);
        page--;
        if (currentPage > page) {
          currentPage = page;
        }
        this.setPage(currentPage);
      }
    };
    var _setPage = function (n) {
      if (n > 0 && n <= page) {
        currentPage = n;
      }
    };

    var getNumberOfPages = API.__private__.getNumberOfPages = API.getNumberOfPages = function () {
      return pages.length - 1;
    }
    /**
     * Returns a document-specific font key - a label assigned to a
     * font name + font type combination at the time the font was added
     * to the font inventory.
     *
     * Font key is used as label for the desired font for a block of text
     * to be added to the PDF document stream.
     * @private
     * @function
     * @param fontName {string} can be undefined on "falthy" to indicate "use current"
     * @param fontStyle {string} can be undefined on "falthy" to indicate "use current"
     * @returns {string} Font key.
     * @ignore
     */
    var getFont = function (fontName, fontStyle, options) {
      var key = undefined,
          originalFontName, fontNameLowerCase;
      options = options || {};

      fontName = fontName !== undefined ? fontName : fonts[activeFontKey].fontName;
      fontStyle = fontStyle !== undefined ? fontStyle : fonts[activeFontKey].fontStyle;
      fontNameLowerCase = fontName.toLowerCase();

      if (fontmap[fontNameLowerCase] !== undefined && fontmap[fontNameLowerCase][fontStyle] !== undefined) {
        key = fontmap[fontNameLowerCase][fontStyle];
      } else if (fontmap[fontName] !== undefined && fontmap[fontName][fontStyle] !== undefined) {
        key = fontmap[fontName][fontStyle];
      } else {
        if (options.disableWarning === false) {
          console.warn("Unable to look up font label for font '" + fontName + "', '" + fontStyle + "'. Refer to getFontList() for available fonts.");
        }
      }

      if (!key && !options.noFallback) {
        key = fontmap['times'][fontStyle];
        if (key == null) {
          key = fontmap['times']['normal'];
        }
      }
      return key;
    };


    var putInfo = API.__private__.putInfo = function () {
      newObject();
      out('<<');
      out('/Producer (jsPDF ' + jsPDF.version + ')');
      for (var key in documentProperties) {
        if (documentProperties.hasOwnProperty(key) && documentProperties[key]) {
          out('/' + key.substr(0, 1).toUpperCase() + key.substr(1) + ' (' +
              pdfEscape(documentProperties[key]) + ')');
        }
      }
      out('/CreationDate (' + creationDate + ')');
      out('>>');
      out('endobj');
    };

    var putCatalog = API.__private__.putCatalog = function (options) {
      options = options || {};
      var tmpRootDictionaryObjId = options.rootDictionaryObjId || rootDictionaryObjId;
      newObject();
      out('<<');
      out('/Type /Catalog');
      out('/Pages ' + tmpRootDictionaryObjId + ' 0 R');
      // PDF13ref Section 7.2.1
      if (!zoomMode) zoomMode = 'fullwidth';
      switch (zoomMode) {
        case 'fullwidth':
          out('/OpenAction [3 0 R /FitH null]');
          break;
        case 'fullheight':
          out('/OpenAction [3 0 R /FitV null]');
          break;
        case 'fullpage':
          out('/OpenAction [3 0 R /Fit]');
          break;
        case 'original':
          out('/OpenAction [3 0 R /XYZ null null 1]');
          break;
        default:
          var pcn = '' + zoomMode;
          if (pcn.substr(pcn.length - 1) === '%')
            zoomMode = parseInt(zoomMode) / 100;
          if (typeof zoomMode === 'number') {
            out('/OpenAction [3 0 R /XYZ null null ' + f2(zoomMode) + ']');
          }
      }
      if (!layoutMode) layoutMode = 'continuous';
      switch (layoutMode) {
        case 'continuous':
          out('/PageLayout /OneColumn');
          break;
        case 'single':
          out('/PageLayout /SinglePage');
          break;
        case 'two':
        case 'twoleft':
          out('/PageLayout /TwoColumnLeft');
          break;
        case 'tworight':
          out('/PageLayout /TwoColumnRight');
          break;
      }
      if (pageMode) {
        /**
         * A name object specifying how the document should be displayed when opened:
         * UseNone      : Neither document outline nor thumbnail images visible -- DEFAULT
         * UseOutlines  : Document outline visible
         * UseThumbs    : Thumbnail images visible
         * FullScreen   : Full-screen mode, with no menu bar, window controls, or any other window visible
         */
        out('/PageMode /' + pageMode);
      }
      events.publish('putCatalog');
      out('>>');
      out('endobj');
    };

    var putTrailer = API.__private__.putTrailer = function () {
      out('trailer');
      out('<<');
      out('/Size ' + (objectNumber + 1));
      out('/Root ' + objectNumber + ' 0 R');
      out('/Info ' + (objectNumber - 1) + ' 0 R');
      out("/ID [ <" + fileId + "> <" + fileId + "> ]");
      out('>>');
    };

    var putHeader = API.__private__.putHeader = function () {
      out('%PDF-' + pdfVersion);
      out("%\xBA\xDF\xAC\xE0");
    };

    var putXRef = API.__private__.putXRef = function () {
      var i = 1;
      var p = "0000000000";

      out('xref');
      out('0 ' + (objectNumber + 1));
      out('0000000000 65535 f ');
      for (i = 1; i <= objectNumber; i++) {
        var offset = offsets[i];
        if (typeof offset === 'function') {
          out((p + offsets[i]()).slice(-10) + ' 00000 n ');
        } else {
          if (typeof offsets[i] !== "undefined") {
            out((p + offsets[i]).slice(-10) + ' 00000 n ');
          } else {
            out('0000000000 00000 n ');
          }
        }
      }
    };

    var buildDocument = API.__private__.buildDocument = function () {
      outToPages = false; // switches out() to content

      //reset fields relevant for objectNumber generation and xref.
      objectNumber = 0;
      content_length = 0;
      content = [];
      offsets = [];
      additionalObjects = [];
      rootDictionaryObjId = newObjectDeferred();
      resourceDictionaryObjId = newObjectDeferred();

      events.publish('buildDocument');

      putHeader();
      putPages();
      putAdditionalObjects();
      putResources();
      putInfo();
      putCatalog();

      var offsetOfXRef = content_length;
      putXRef();
      putTrailer();
      out('startxref');
      out('' + offsetOfXRef);
      out('%%EOF');

      outToPages = true;

      return content.join('\n');
    };

    var getBlob = API.__private__.getBlob = function (data) {
      return new Blob([getArrayBuffer(data)], {
        type: "application/pdf"
      });
    };

    /**
     * Generates the PDF document.
     *
     * If `type` argument is undefined, output is raw body of resulting PDF returned as a string.
     *
     * @param {string} type A string identifying one of the possible output types. Possible values are 'arraybuffer', 'blob', 'bloburi'/'bloburl', 'datauristring'/'dataurlstring', 'datauri'/'dataurl', 'dataurlnewwindow'.
     * @param {Object} options An object providing some additional signalling to PDF generator. Possible options are 'filename'.
     *
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name output
     */
    var output = API.output = API.__private__.output = SAFE(function output(type, options) {
      options = options || {};

      var pdfDocument = buildDocument();
      if (typeof options === "string") {
        options = {
          filename: options
        };
      } else {
        options.filename = options.filename || 'generated.pdf';
      }

      switch (type) {
        case undefined:
          return pdfDocument;
        case 'save':
          API.save(options.filename);
          break;
        case 'arraybuffer':
          return getArrayBuffer(pdfDocument);
        case 'blob':
          return getBlob(pdfDocument);
        case 'bloburi':
        case 'bloburl':
          // Developer is responsible of calling revokeObjectURL
          if (typeof global.URL !== "undefined" && typeof global.URL.createObjectURL === "function") {
            return global.URL && global.URL.createObjectURL(getBlob(pdfDocument)) || void 0;
          } else {f
            console.warn('bloburl is not supported by your system, because URL.createObjectURL is not supported by your browser.');
          }
          break;
        case 'datauristring':
        case 'dataurlstring':
          return 'data:application/pdf;filename=' + options.filename + ';base64,' + btoa(pdfDocument);
        case 'dataurlnewwindow':
          var htmlForNewWindow = '<html>' +
              '<style>html, body { padding: 0; margin: 0; } iframe { width: 100%; height: 100%; border: 0;}  </style>' +
              '<body>' +
              '<iframe src="' + this.output('datauristring') + '"></iframe>' +
              '</body></html>';
          var nW = global.open();
          if (nW !== null) {
            nW.document.write(htmlForNewWindow)
          }
          if (nW || typeof safari === "undefined") return nW;
          /* pass through */
        case 'datauri':
        case 'dataurl':
          return global.document.location.href = 'data:application/pdf;filename=' + options.filename + ';base64,' + btoa(pdfDocument);
        default:
          return null;
      }
    });

    /**
     * Used to see if a supplied hotfix was requested when the pdf instance was created.
     * @param {string} hotfixName - The name of the hotfix to check.
     * @returns {boolean}
     */
    var hasHotfix = function (hotfixName) {
      return (Array.isArray(hotfixes) === true &&
          hotfixes.indexOf(hotfixName) > -1);
    };

    switch (unit) {
      case 'pt':
        k = 1;
        break;
      case 'mm':
        k = 72 / 25.4;
        break;
      case 'cm':
        k = 72 / 2.54;
        break;
      case 'in':
        k = 72;
        break;
      case 'px':
        if (hasHotfix('px_scaling') == true) {
          k = 72 / 96;
        } else {
          k = 96 / 72;
        }
        break;
      case 'pc':
        k = 12;
        break;
      case 'em':
        k = 12;
        break;
      case 'ex':
        k = 6;
        break;
      default:
        throw new Error('Invalid unit: ' + unit);
    }

    setCreationDate();
    setFileId();

    //---------------------------------------
    // Public API

    var getPageInfo = API.__private__.getPageInfo = function (pageNumberOneBased) {
      if (isNaN(pageNumberOneBased) || (pageNumberOneBased % 1 !== 0)) {
        throw new Error('Invalid argument passed to jsPDF.getPageInfo');
      }
      var objId = pagesContext[pageNumberOneBased].objId;
      return {
        objId: objId,
        pageNumber: pageNumberOneBased,
        pageContext: pagesContext[pageNumberOneBased]
      };
    };

    var getPageInfoByObjId = API.__private__.getPageInfoByObjId = function (objId) {
      var pageNumberWithObjId;
      for (var pageNumber in pagesContext) {
        if (pagesContext[pageNumber].objId === objId) {
          pageNumberWithObjId = pageNumber;
          break;
        }
      }
      if (isNaN(objId) || (objId % 1 !== 0)) {
        throw new Error('Invalid argument passed to jsPDF.getPageInfoByObjId');
      }
      return getPageInfo(pageNumber);
    };

    var getCurrentPageInfo = API.__private__.getCurrentPageInfo = function () {
      return {
        objId: pagesContext[currentPage].objId,
        pageNumber: currentPage,
        pageContext: pagesContext[currentPage]
      };
    };

    /**
     * Adds (and transfers the focus to) new page to the PDF document.
     * @param format {String/Array} The format of the new page. Can be: <ul><li>a0 - a10</li><li>b0 - b10</li><li>c0 - c10</li><li>dl</li><li>letter</li><li>government-letter</li><li>legal</li><li>junior-legal</li><li>ledger</li><li>tabloid</li><li>credit-card</li></ul><br />
     * Default is "a4". If you want to use your own format just pass instead of one of the above predefined formats the size as an number-array, e.g. [595.28, 841.89]
     * @param orientation {string} Orientation of the new page. Possible values are "portrait" or "landscape" (or shortcuts "p" (Default), "l").
     * @function
     * @instance
     * @returns {jsPDF}
     *
     * @memberOf jsPDF
     * @name addPage
     */
    API.addPage = function () {
      _addPage.apply(this, arguments);
      return this;
    };
    /**
     * Adds (and transfers the focus to) new page to the PDF document.
     * @function
     * @instance
     * @returns {jsPDF}
     *
     * @memberOf jsPDF
     * @name setPage
     * @param {number} page Switch the active page to the page number specified.
     * @example
     * doc = jsPDF()
     * doc.addPage()
     * doc.addPage()
     * doc.text('I am on page 3', 10, 10)
     * doc.setPage(1)
     * doc.text('I am on page 1', 10, 10)
     */
    API.setPage = function () {
      _setPage.apply(this, arguments);
      return this;
    };

    /**
     * @name insertPage
     * @memberOf jsPDF
     *
     * @function
     * @instance
     * @param {Object} beforePage
     * @returns {jsPDF}
     */
    API.insertPage = function (beforePage) {
      this.addPage();
      this.movePage(currentPage, beforePage);
      return this;
    };

    /**
     * @name movePage
     * @memberOf jsPDF
     * @function
     * @instance
     * @param {Object} targetPage
     * @param {Object} beforePage
     * @returns {jsPDF}
     */
    API.movePage = function (targetPage, beforePage) {
      if (targetPage > beforePage) {
        var tmpPages = pages[targetPage];
        var tmpPagesContext = pagesContext[targetPage];
        for (var i = targetPage; i > beforePage; i--) {
          pages[i] = pages[i - 1];
          pagesContext[i] = pagesContext[i - 1];
        }
        pages[beforePage] = tmpPages;
        pagesContext[beforePage] = tmpPagesContext;
        this.setPage(beforePage);
      } else if (targetPage < beforePage) {
        var tmpPages = pages[targetPage];
        var tmpPagesContext = pagesContext[targetPage];
        for (var i = targetPage; i < beforePage; i++) {
          pages[i] = pages[i + 1];
          pagesContext[i] = pagesContext[i + 1];
        }
        pages[beforePage] = tmpPages;
        pagesContext[beforePage] = tmpPagesContext;
        this.setPage(beforePage);
      }
      return this;
    };

    /**
     * Deletes a page from the PDF.
     * @name deletePage
     * @memberOf jsPDF
     * @function
     * @instance
     * @returns {jsPDF}
     */
    API.deletePage = function () {
      _deletePage.apply(this, arguments);
      return this;
    };

    /**
     * Adds text to page. Supports adding multiline text when 'text' argument is an Array of Strings.
     *
     * @function
     * @instance
     * @param {String|Array} text String or array of strings to be added to the page. Each line is shifted one line down per font, spacing settings declared before this call.
     * @param {number} x Coordinate (in units declared at inception of PDF document) against left edge of the page.
     * @param {number} y Coordinate (in units declared at inception of PDF document) against upper edge of the page.
     * @param {Object} [options] - Collection of settings signaling how the text must be encoded.
     * @param {string} [options.align=left] - The alignment of the text, possible values: left, center, right, justify.
     * @param {string} [options.baseline=alphabetic] - Sets text baseline used when drawing the text, possible values: alphabetic, ideographic, bottom, top, middle.
     * @param {string} [options.angle=0] - Rotate the text counterclockwise. Expects the angle in degree.
     * @param {string} [options.charSpace=0] - The space between each letter.
     * @param {string} [options.lineHeightFactor=1.15] - The lineheight of each line.
     * @param {string} [options.flags] - Flags for to8bitStream.
     * @param {string} [options.flags.noBOM=true] - Don't add BOM to Unicode-text.
     * @param {string} [options.flags.autoencode=true] - Autoencode the Text.
     * @param {string} [options.maxWidth=0] - Split the text by given width, 0 = no split.
     * @param {string} [options.renderingMode=fill] - Set how the text should be rendered, possible values: fill, stroke, fillThenStroke, invisible, fillAndAddForClipping, strokeAndAddPathForClipping, fillThenStrokeAndAddToPathForClipping, addToPathForClipping.
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name text
     */
    var text = API.__private__.text = API.text = function (text, x, y, options) {
      /**
       * Inserts something like this into PDF
       *   BT
       *    /F1 16 Tf  % Font name + size
       *    16 TL % How many units down for next line in multiline text
       *    0 g % color
       *    28.35 813.54 Td % position
       *    (line one) Tj
       *    T* (line two) Tj
       *    T* (line three) Tj
       *   ET
       */
          //backwardsCompatibility
      var tmp;

      // Pre-August-2012 the order of arguments was function(x, y, text, flags)
      // in effort to make all calls have similar signature like
      //   function(data, coordinates... , miscellaneous)
      // this method had its args flipped.
      // code below allows backward compatibility with old arg order.
      if (typeof text === 'number' && typeof x === 'number' && (typeof y === 'string' || Array.isArray(y))) {
        tmp = y;
        y = x;
        x = text;
        text = tmp;
      }

      var flags = arguments[3];
      var angle = arguments[4];
      var align = arguments[5];

      if (typeof flags !== "object" || flags === null) {
        if (typeof angle === 'string') {
          align = angle;
          angle = null;
        }
        if (typeof flags === 'string') {
          align = flags;
          flags = null;
        }
        if (typeof flags === 'number') {
          angle = flags;
          flags = null;
        }
        options = {
          flags: flags,
          angle: angle,
          align: align
        };
      }

      flags = flags || {};
      flags.noBOM = flags.noBOM || true;
      flags.autoencode = flags.autoencode || true;

      if (isNaN(x) || isNaN(y) || typeof text === "undefined" || text === null) {
        throw new Error('Invalid arguments passed to jsPDF.text');
      }

      if (text.length === 0) {
        return scope;
      }

      var xtra = '';
      var isHex = false;
      var lineHeight = typeof options.lineHeightFactor === 'number' ? options.lineHeightFactor : lineHeightFactor;

      var scope = options.scope || this;

      function ESC(s) {
        s = s.split("\t").join(Array(options.TabLen || 9).join(" "));
        return pdfEscape(s, flags);
      }

      function transformTextToSpecialArray(text) {
        //we don't want to destroy original text array, so cloning it
        var sa = text.concat();
        var da = [];
        var len = sa.length;
        var curDa;
        //we do array.join('text that must not be PDFescaped")
        //thus, pdfEscape each component separately
        while (len--) {
          curDa = sa.shift();
          if (typeof curDa === "string") {
            da.push(curDa);
          } else {
            if (Array.isArray(text) && curDa.length === 1) {
              da.push(curDa[0]);
            } else {
              da.push([curDa[0], curDa[1], curDa[2]]);
            }
          }
        }
        return da;
      }

      function processTextByFunction(text, processingFunction) {
        var result;
        if (typeof text === 'string') {
          result = processingFunction(text)[0];
        } else if (Array.isArray(text)) {
          //we don't want to destroy original text array, so cloning it
          var sa = text.concat();
          var da = [];
          var len = sa.length;
          var curDa;
          var tmpResult;
          //we do array.join('text that must not be PDFescaped")
          //thus, pdfEscape each component separately
          while (len--) {
            curDa = sa.shift();
            if (typeof curDa === "string") {
              da.push(processingFunction(curDa)[0]);
            } else if ((Array.isArray(curDa) && curDa[0] === "string")) {
              tmpResult = processingFunction(curDa[0], curDa[1], curDa[2]);
              da.push([tmpResult[0], tmpResult[1], tmpResult[2]]);
            }
          }
          result = da;
        }
        return result;
      }

      //Check if text is of type String
      var textIsOfTypeString = false;
      var tmpTextIsOfTypeString = true;

      if (typeof text === 'string') {
        textIsOfTypeString = true;
      } else if (Array.isArray(text)) {
        //we don't want to destroy original text array, so cloning it
        var sa = text.concat();
        var da = [];
        var len = sa.length;
        var curDa;
        //we do array.join('text that must not be PDFescaped")
        //thus, pdfEscape each component separately
        while (len--) {
          curDa = sa.shift();
          if (typeof curDa !== "string" || (Array.isArray(curDa) && typeof curDa[0] !== "string")) {
            tmpTextIsOfTypeString = false;
          }
        }
        textIsOfTypeString = tmpTextIsOfTypeString
      }
      if (textIsOfTypeString === false) {
        throw new Error('Type of text must be string or Array. "' + text + '" is not recognized.');
      }

      //If there are any newlines in text, we assume
      //the user wanted to print multiple lines, so break the
      //text up into an array. If the text is already an array,
      //we assume the user knows what they are doing.
      //Convert text into an array anyway to simplify
      //later code.

      if (typeof text === 'string') {
        if (text.match(/[\r?\n]/)) {
          text = text.split(/\r\n|\r|\n/g);
        } else {
          text = [text];
        }
      }

      //baseline
      var height = activeFontSize / scope.internal.scaleFactor;
      var descent = height * (lineHeightFactor - 1);
      switch (options.baseline) {
        case 'bottom':
          y -= descent;
          break;
        case 'top':
          y += height - descent;
          break;
        case 'hanging':
          y += height - 2 * descent;
          break;
        case 'middle':
          y += height / 2 - descent;
          break;
        case 'ideographic':
        case 'alphabetic':
        default:
          // do nothing, everything is fine
          break;
      }

      //multiline
      var maxWidth = options.maxWidth || 0;

      if (maxWidth > 0) {
        if (typeof text === 'string') {
          text = scope.splitTextToSize(text, maxWidth);
        } else if (Object.prototype.toString.call(text) === '[object Array]') {
          text = scope.splitTextToSize(text.join(" "), maxWidth);
        }
      }


      //creating Payload-Object to make text byRef
      var payload = {
        text: text,
        x: x,
        y: y,
        options: options,
        mutex: {
          pdfEscape: pdfEscape,
          activeFontKey: activeFontKey,
          fonts: fonts,
          activeFontSize: activeFontSize
        }
      };
      events.publish('preProcessText', payload);

      text = payload.text;
      options = payload.options;
      //angle

      var angle = options.angle;
      var k = scope.internal.scaleFactor;
      var transformationMatrix = [];

      if (angle) {
        angle *= (Math.PI / 180);
        var c = Math.cos(angle),
            s = Math.sin(angle);
        transformationMatrix = [f2(c), f2(s), f2(s * -1), f2(c)];
      }

      //charSpace

      var charSpace = options.charSpace;

      if (typeof charSpace !== 'undefined') {
        xtra += f3(charSpace * k) + " Tc\n";
      }

      //lang

      var lang = options.lang;

      if (lang) {
        //    xtra += "/Lang (" + lang +")\n";
      }

      //renderingMode

      var renderingMode = -1;
      var tmpRenderingMode = -1;
      var parmRenderingMode = (typeof options.renderingMode !== "undefined") ? options.renderingMode : options.stroke;
      var pageContext = scope.internal.getCurrentPageInfo().pageContext;

      switch (parmRenderingMode) {
        case 0:
        case false:
        case 'fill':
          tmpRenderingMode = 0;
          break;
        case 1:
        case true:
        case 'stroke':
          tmpRenderingMode = 1;
          break;
        case 2:
        case 'fillThenStroke':
          tmpRenderingMode = 2;
          break;
        case 3:
        case 'invisible':
          tmpRenderingMode = 3;
          break;
        case 4:
        case 'fillAndAddForClipping':
          tmpRenderingMode = 4;
          break;
        case 5:
        case 'strokeAndAddPathForClipping':
          tmpRenderingMode = 5;
          break;
        case 6:
        case 'fillThenStrokeAndAddToPathForClipping':
          tmpRenderingMode = 6;
          break;
        case 7:
        case 'addToPathForClipping':
          tmpRenderingMode = 7;
          break;
      }

      var usedRenderingMode = typeof pageContext.usedRenderingMode !== 'undefined' ? pageContext.usedRenderingMode : -1;

      //if the coder wrote it explicitly to use a specific
      //renderingMode, then use it
      if (tmpRenderingMode !== -1) {
        xtra += tmpRenderingMode + " Tr\n"
        //otherwise check if we used the rendering Mode already
        //if so then set the rendering Mode...
      } else if (usedRenderingMode !== -1) {
        xtra += "0 Tr\n";
      }

      if (tmpRenderingMode !== -1) {
        pageContext.usedRenderingMode = tmpRenderingMode;
      }

      //align

      var align = options.align || 'left';
      var leading = activeFontSize * lineHeight;
      var pageWidth = scope.internal.pageSize.getWidth();
      var k = scope.internal.scaleFactor;
      var lineWidth = lineWidth;
      var activeFont = fonts[activeFontKey];
      var charSpace = options.charSpace || activeCharSpace;
      var widths;
      var maxWidth = options.maxWidth || 0;

      var lineWidths;
      var flags = {};
      var wordSpacingPerLine = [];

      if (Object.prototype.toString.call(text) === '[object Array]') {
        var da = transformTextToSpecialArray(text);
        var left = 0;
        var newY;
        var maxLineLength;
        var lineWidths;
        if (align !== "left") {
          lineWidths = da.map(function (v) {
            return scope.getStringUnitWidth(v, {
              font: activeFont,
              charSpace: charSpace,
              fontSize: activeFontSize
            }) * activeFontSize / k;
          });
        }
        var maxLineLength = Math.max.apply(Math, lineWidths);
        //The first line uses the "main" Td setting,
        //and the subsequent lines are offset by the
        //previous line's x coordinate.
        var prevWidth = 0;
        var delta;
        var newX;
        if (align === "right") {
          //The passed in x coordinate defines the
          //rightmost point of the text.
          left = x - maxLineLength;
          x -= lineWidths[0];
          text = [];
          for (var i = 0, len = da.length; i < len; i++) {
            delta = maxLineLength - lineWidths[i];
            if (i === 0) {
              newX = getHorizontalCoordinate(x);
              newY = getVerticalCoordinate(y);
            } else {
              newX = (prevWidth - lineWidths[i]) * k;
              newY = -leading;
            }
            text.push([da[i], newX, newY]);
            prevWidth = lineWidths[i];
          }
        } else if (align === "center") {
          //The passed in x coordinate defines
          //the center point.
          left = x - maxLineLength / 2;
          x -= lineWidths[0] / 2;
          text = [];
          for (var i = 0, len = da.length; i < len; i++) {
            delta = (maxLineLength - lineWidths[i]) / 2;
            if (i === 0) {
              newX = getHorizontalCoordinate(x);
              newY = getVerticalCoordinate(y);
            } else {
              newX = (prevWidth - lineWidths[i]) / 2 * k;
              newY = -leading;
            }
            text.push([da[i], newX, newY]);
            prevWidth = lineWidths[i];
          }
        } else if (align === "left") {
          text = [];
          for (var i = 0, len = da.length; i < len; i++) {
            newY = (i === 0) ? getVerticalCoordinate(y) : -leading;
            newX = (i === 0) ? getHorizontalCoordinate(x) : 0;
            //text.push([da[i], newX, newY]);
            text.push(da[i]);
          }
        } else if (align === "justify") {
          text = [];
          var maxWidth = (maxWidth !== 0) ? maxWidth : pageWidth;

          for (var i = 0, len = da.length; i < len; i++) {
            newY = (i === 0) ? getVerticalCoordinate(y) : -leading;
            newX = (i === 0) ? getHorizontalCoordinate(x) : 0;
            if (i < (len - 1)) {
              wordSpacingPerLine.push(((maxWidth - lineWidths[i]) / (da[i].split(" ").length - 1) * k).toFixed(2));
            }
            text.push([da[i], newX, newY]);
          }
        } else {
          throw new Error(
              'Unrecognized alignment option, use "left", "center", "right" or "justify".'
          );
        }
      }

      //R2L
      var doReversing = typeof options.R2L === "boolean" ? options.R2L : R2L;
      if (doReversing === true) {
        text = processTextByFunction(text, function (text, posX, posY) {
          return [text.split("").reverse().join(""), posX, posY];
        });
      }

      //creating Payload-Object to make text byRef
      var payload = {
        text: text,
        x: x,
        y: y,
        options: options,
        mutex: {
          pdfEscape: pdfEscape,
          activeFontKey: activeFontKey,
          fonts: fonts,
          activeFontSize: activeFontSize
        }
      };
      events.publish('postProcessText', payload);

      //Escaping
      var activeFontEncoding = fonts[activeFontKey].encoding;

      if (activeFontEncoding === "WinAnsiEncoding" || activeFontEncoding === "StandardEncoding") {
        text = processTextByFunction(text, function (text, posX, posY) {
          return [ESC(text), posX, posY];
        });
      }

      text = payload.text;
      isHex = payload.mutex.isHex;

      var da = transformTextToSpecialArray(text);

      text = [];
      var variant = 0;
      var len = da.length;
      var posX;
      var posY;
      var content;
      var wordSpacing = '';

      for (var i = 0; i < len; i++) {

        wordSpacing = '';
        if (!Array.isArray(da[i])) {
          posX = getHorizontalCoordinate(x);
          posY = getVerticalCoordinate(y);
          content = (((isHex) ? "<" : "(")) + da[i] + ((isHex) ? ">" : ")");

        } else {
          posX = parseFloat(da[i][1]);
          posY = parseFloat(da[i][2]);
          content = (((isHex) ? "<" : "(")) + da[i][0] + ((isHex) ? ">" : ")");
          variant = 1;
        }
        if (wordSpacingPerLine !== undefined && wordSpacingPerLine[i] !== undefined) {
          wordSpacing = wordSpacingPerLine[i] + " Tw\n";
        }

        if (transformationMatrix.length !== 0 && i === 0) {
          text.push(wordSpacing + transformationMatrix.join(" ") + " " + posX.toFixed(2) + " " + posY.toFixed(2) + " Tm\n" + content);
        } else if (variant === 1 || (variant === 0 && i === 0)) {
          text.push(wordSpacing + posX.toFixed(2) + " " + posY.toFixed(2) + " Td\n" + content);
        } else {
          text.push(wordSpacing + content);
        }
      }
      if (variant === 0) {
        text = text.join(" Tj\nT* ");
      } else {
        text = text.join(" Tj\n");
      }

      text += " Tj\n";

      var result = 'BT\n/' +
          activeFontKey + ' ' + activeFontSize + ' Tf\n' + // font face, style, size
          (activeFontSize * lineHeight).toFixed(2) + ' TL\n' + // line spacing
          textColor + '\n';
      result += xtra;
      result += text;
      result += "ET";

      out(result);
      usedFonts[activeFontKey] = true;
      return scope;
    };

    /**
     * Letter spacing method to print text with gaps
     *
     * @function
     * @instance
     * @param {String|Array} text String to be added to the page.
     * @param {number} x Coordinate (in units declared at inception of PDF document) against left edge of the page
     * @param {number} y Coordinate (in units declared at inception of PDF document) against upper edge of the page
     * @param {number} spacing Spacing (in units declared at inception)
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name lstext
     * @deprecated We'll be removing this function. It doesn't take character width into account.
     */
    var lstext = API.__private__.lstext = API.lstext = function (text, x, y, charSpace) {
      console.warn('jsPDF.lstext is deprecated');
      return this.text(text, x, y, {
        charSpace: charSpace
      });
    };

    /**
     *
     * @name clip
     * @function
     * @instance
     * @param {string} rule
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @description All .clip() after calling drawing ops with a style argument of null.
     */
    var clip = API.__private__.clip = API.clip = function (rule) {
      // Call .clip() after calling drawing ops with a style argument of null
      // W is the PDF clipping op
      if ('evenodd' === rule) {
        out('W*');
      } else {
        out('W');
      }
      // End the path object without filling or stroking it.
      // This operator is a path-painting no-op, used primarily for the side effect of changing the current clipping path
      // (see Section 4.4.3, “Clipping Path Operators”)
      out('n');
    };

    /**
     * This fixes the previous function clip(). Perhaps the 'stroke path' hack was due to the missing 'n' instruction?
     * We introduce the fixed version so as to not break API.
     * @param fillRule
     * @ignore
     */
    var clip_fixed = API.__private__.clip_fixed = API.clip_fixed = function (rule) {
      console.log("clip_fixed is deprecated");
      API.clip(rule);
    };


    var isValidStyle = API.__private__.isValidStyle = function (style) {
      var validStyleVariants = [undefined, null, 'S', 'F', 'DF', 'FD', 'f', 'f*', 'B', 'B*'];
      var result = false;
      if (validStyleVariants.indexOf(style) !== -1) {
        result = true;
      }
      return (result);
    }

    var getStyle = API.__private__.getStyle = function (style) {

      // see path-painting operators in PDF spec
      var op = 'S'; // stroke
      if (style === 'F') {
        op = 'f'; // fill
      } else if (style === 'FD' || style === 'DF') {
        op = 'B'; // both
      } else if (style === 'f' || style === 'f*' || style === 'B' ||
          style === 'B*') {
        /*
         Allow direct use of these PDF path-painting operators:
         - f    fill using nonzero winding number rule
         - f*    fill using even-odd rule
         - B    fill then stroke with fill using non-zero winding number rule
         - B*    fill then stroke with fill using even-odd rule
         */
        op = style;
      }
      return op;
    };

    /**
     * Draw a line on the current page.
     *
     * @name line
     * @function
     * @instance
     * @param {number} x1
     * @param {number} y1
     * @param {number} x2
     * @param {number} y2
     * @returns {jsPDF}
     * @memberOf jsPDF
     */
    var line = API.__private__.line = API.line = function (x1, y1, x2, y2) {
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
        throw new Error('Invalid arguments passed to jsPDF.line');
      }
      return this.lines([
        [x2 - x1, y2 - y1]
      ], x1, y1);
    };

    /**
     * Adds series of curves (straight lines or cubic bezier curves) to canvas, starting at `x`, `y` coordinates.
     * All data points in `lines` are relative to last line origin.
     * `x`, `y` become x1,y1 for first line / curve in the set.
     * For lines you only need to specify [x2, y2] - (ending point) vector against x1, y1 starting point.
     * For bezier curves you need to specify [x2,y2,x3,y3,x4,y4] - vectors to control points 1, 2, ending point. All vectors are against the start of the curve - x1,y1.
     *
     * @example .lines([[2,2],[-2,2],[1,1,2,2,3,3],[2,1]], 212,110, [1,1], 'F', false) // line, line, bezier curve, line
     * @param {Array} lines Array of *vector* shifts as pairs (lines) or sextets (cubic bezier curves).
     * @param {number} x Coordinate (in units declared at inception of PDF document) against left edge of the page.
     * @param {number} y Coordinate (in units declared at inception of PDF document) against upper edge of the page.
     * @param {number} scale (Defaults to [1.0,1.0]) x,y Scaling factor for all vectors. Elements can be any floating number Sub-one makes drawing smaller. Over-one grows the drawing. Negative flips the direction.
     * @param {string} style A string specifying the painting style or null.  Valid styles include: 'S' [default] - stroke, 'F' - fill,  and 'DF' (or 'FD') -  fill then stroke. A null value postpones setting the style so that a shape may be composed using multiple method calls. The last drawing method call used to define the shape should not have a null style argument.
     * @param {boolean} closed If true, the path is closed with a straight line from the end of the last curve to the starting point.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name lines
     */
    var lines = API.__private__.lines = API.lines = function (lines, x, y, scale, style, closed) {
      var scalex, scaley, i, l, leg, x2, y2, x3, y3, x4, y4, tmp;

      // Pre-August-2012 the order of arguments was function(x, y, lines, scale, style)
      // in effort to make all calls have similar signature like
      //   function(content, coordinateX, coordinateY , miscellaneous)
      // this method had its args flipped.
      // code below allows backward compatibility with old arg order.
      if (typeof lines === 'number') {
        tmp = y;
        y = x;
        x = lines;
        lines = tmp;
      }

      scale = scale || [1, 1];
      closed = closed || false;

      if (isNaN(x) || isNaN(y) || !Array.isArray(lines) || !Array.isArray(scale) || !isValidStyle(style) || typeof closed !== 'boolean') {
        throw new Error('Invalid arguments passed to jsPDF.lines');
      }

      // starting point
      out(f3(getHorizontalCoordinate(x)) + ' ' + f3(getVerticalCoordinate(y)) + ' m ');

      scalex = scale[0];
      scaley = scale[1];
      l = lines.length;
      //, x2, y2 // bezier only. In page default measurement "units", *after* scaling
      //, x3, y3 // bezier only. In page default measurement "units", *after* scaling
      // ending point for all, lines and bezier. . In page default measurement "units", *after* scaling
      x4 = x; // last / ending point = starting point for first item.
      y4 = y; // last / ending point = starting point for first item.

      for (i = 0; i < l; i++) {
        leg = lines[i];
        if (leg.length === 2) {
          // simple line
          x4 = leg[0] * scalex + x4; // here last x4 was prior ending point
          y4 = leg[1] * scaley + y4; // here last y4 was prior ending point
          out(f3(getHorizontalCoordinate(x4)) + ' ' + f3(getVerticalCoordinate(y4)) + ' l');
        } else {
          // bezier curve
          x2 = leg[0] * scalex + x4; // here last x4 is prior ending point
          y2 = leg[1] * scaley + y4; // here last y4 is prior ending point
          x3 = leg[2] * scalex + x4; // here last x4 is prior ending point
          y3 = leg[3] * scaley + y4; // here last y4 is prior ending point
          x4 = leg[4] * scalex + x4; // here last x4 was prior ending point
          y4 = leg[5] * scaley + y4; // here last y4 was prior ending point
          out(
              f3(getHorizontalCoordinate(x2)) + ' ' +
              f3(getVerticalCoordinate(y2)) + ' ' +
              f3(getHorizontalCoordinate(x3)) + ' ' +
              f3(getVerticalCoordinate(y3)) + ' ' +
              f3(getHorizontalCoordinate(x4)) + ' ' +
              f3(getVerticalCoordinate(y4)) + ' c');
        }
      }

      if (closed) {
        out(' h');
      }

      // stroking / filling / both the path
      if (style !== null) {
        out(getStyle(style));
      }
      return this;
    };

    /**
     * Adds a rectangle to PDF.
     *
     * @param {number} x Coordinate (in units declared at inception of PDF document) against left edge of the page.
     * @param {number} y Coordinate (in units declared at inception of PDF document) against upper edge of the page.
     * @param {number} w Width (in units declared at inception of PDF document).
     * @param {number} h Height (in units declared at inception of PDF document).
     * @param {string} style A string specifying the painting style or null.  Valid styles include: 'S' [default] - stroke, 'F' - fill,  and 'DF' (or 'FD') -  fill then stroke. A null value postpones setting the style so that a shape may be composed using multiple method calls. The last drawing method call used to define the shape should not have a null style argument.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name rect
     */
    var rect = API.__private__.rect = API.rect = function (x, y, w, h, style) {
      if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h) || !isValidStyle(style)) {
        throw new Error('Invalid arguments passed to jsPDF.rect');
      }

      out([
        f2(getHorizontalCoordinate(x)),
        f2(getVerticalCoordinate(y)),
        f2(w * k),
        f2(-h * k),
        're'
      ].join(' '));

      if (style !== null) {
        out(getStyle(style));
      }

      return this;
    };

    /**
     * Adds a triangle to PDF.
     *
     * @param {number} x1 Coordinate (in units declared at inception of PDF document) against left edge of the page.
     * @param {number} y1 Coordinate (in units declared at inception of PDF document) against upper edge of the page.
     * @param {number} x2 Coordinate (in units declared at inception of PDF document) against left edge of the page.
     * @param {number} y2 Coordinate (in units declared at inception of PDF document) against upper edge of the page.
     * @param {number} x3 Coordinate (in units declared at inception of PDF document) against left edge of the page.
     * @param {number} y3 Coordinate (in units declared at inception of PDF document) against upper edge of the page.
     * @param {string} style A string specifying the painting style or null.  Valid styles include: 'S' [default] - stroke, 'F' - fill,  and 'DF' (or 'FD') -  fill then stroke. A null value postpones setting the style so that a shape may be composed using multiple method calls. The last drawing method call used to define the shape should not have a null style argument.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name triangle
     */
    var triangle = API.__private__.triangle = API.triangle = function (x1, y1, x2, y2, x3, y3, style) {
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2) || isNaN(x3) || isNaN(y3) || !isValidStyle(style)) {
        throw new Error('Invalid arguments passed to jsPDF.triangle');
      }
      this.lines(
          [
            [x2 - x1, y2 - y1], // vector to point 2
            [x3 - x2, y3 - y2], // vector to point 3
            [x1 - x3, y1 - y3] // closing vector back to point 1
          ],
          x1,
          y1, // start of path
          [1, 1],
          style,
          true);
      return this;
    };

    /**
     * Adds a rectangle with rounded corners to PDF.
     *
     * @param {number} x Coordinate (in units declared at inception of PDF document) against left edge of the page.
     * @param {number} y Coordinate (in units declared at inception of PDF document) against upper edge of the page.
     * @param {number} w Width (in units declared at inception of PDF document).
     * @param {number} h Height (in units declared at inception of PDF document).
     * @param {number} rx Radius along x axis (in units declared at inception of PDF document).
     * @param {number} ry Radius along y axis (in units declared at inception of PDF document).
     * @param {string} style A string specifying the painting style or null.  Valid styles include: 'S' [default] - stroke, 'F' - fill,  and 'DF' (or 'FD') -  fill then stroke. A null value postpones setting the style so that a shape may be composed using multiple method calls. The last drawing method call used to define the shape should not have a null style argument.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name roundedRect
     */
    var roundedRect = API.__private__.roundedRect = API.roundedRect = function (x, y, w, h, rx, ry, style) {
      if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h) || isNaN(rx) || isNaN(ry) || !isValidStyle(style)) {
        throw new Error('Invalid arguments passed to jsPDF.roundedRect');
      }
      var MyArc = 4 / 3 * (Math.SQRT2 - 1);
      this.lines(
          [
            [(w - 2 * rx), 0],
            [(rx * MyArc), 0, rx, ry - (ry * MyArc), rx, ry],
            [0, (h - 2 * ry)],
            [0, (ry * MyArc), -(rx * MyArc), ry, -rx, ry],
            [(-w + 2 * rx), 0],
            [-(rx * MyArc), 0, -rx, -(ry * MyArc), -rx, -ry],
            [0, (-h + 2 * ry)],
            [0, -(ry * MyArc), (rx * MyArc), -ry, rx, -ry]
          ],
          x + rx,
          y, // start of path
          [1, 1],
          style);
      return this;
    };

    /**
     * Adds an ellipse to PDF.
     *
     * @param {number} x Coordinate (in units declared at inception of PDF document) against left edge of the page.
     * @param {number} y Coordinate (in units declared at inception of PDF document) against upper edge of the page.
     * @param {number} rx Radius along x axis (in units declared at inception of PDF document).
     * @param {number} ry Radius along y axis (in units declared at inception of PDF document).
     * @param {string} style A string specifying the painting style or null.  Valid styles include: 'S' [default] - stroke, 'F' - fill,  and 'DF' (or 'FD') -  fill then stroke. A null value postpones setting the style so that a shape may be composed using multiple method calls. The last drawing method call used to define the shape should not have a null style argument.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name ellipse
     */
    var ellise = API.__private__.ellipse = API.ellipse = function (x, y, rx, ry, style) {
      if (isNaN(x) || isNaN(y) || isNaN(rx) || isNaN(ry) || !isValidStyle(style)) {
        throw new Error('Invalid arguments passed to jsPDF.ellipse');
      }
      var lx = 4 / 3 * (Math.SQRT2 - 1) * rx,
          ly = 4 / 3 * (Math.SQRT2 - 1) * ry;

      out([
        f2(getHorizontalCoordinate(x + rx)),
        f2(getVerticalCoordinate(y)),
        'm',
        f2(getHorizontalCoordinate(x + rx)),
        f2(getVerticalCoordinate(y - ly)),
        f2(getHorizontalCoordinate(x + lx)),
        f2(getVerticalCoordinate(y - ry)),
        f2(getHorizontalCoordinate(x)),
        f2(getVerticalCoordinate(y - ry)),
        'c'
      ].join(' '));
      out([
        f2(getHorizontalCoordinate(x - lx)),
        f2(getVerticalCoordinate(y - ry)),
        f2(getHorizontalCoordinate(x - rx)),
        f2(getVerticalCoordinate(y - ly)),
        f2(getHorizontalCoordinate(x - rx)),
        f2(getVerticalCoordinate(y)),
        'c'
      ].join(' '));
      out([
        f2(getHorizontalCoordinate(x - rx)),
        f2(getVerticalCoordinate(y + ly)),
        f2(getHorizontalCoordinate(x - lx)),
        f2(getVerticalCoordinate(y + ry)),
        f2(getHorizontalCoordinate(x)),
        f2(getVerticalCoordinate(y + ry)),
        'c'
      ].join(' '));
      out([
        f2(getHorizontalCoordinate(x + lx)),
        f2(getVerticalCoordinate(y + ry)),
        f2(getHorizontalCoordinate(x + rx)),
        f2(getVerticalCoordinate(y + ly)),
        f2(getHorizontalCoordinate(x + rx)),
        f2(getVerticalCoordinate(y)),
        'c'
      ].join(' '));

      if (style !== null) {
        out(getStyle(style));
      }

      return this;
    };

    /**
     * Adds an circle to PDF.
     *
     * @param {number} x Coordinate (in units declared at inception of PDF document) against left edge of the page.
     * @param {number} y Coordinate (in units declared at inception of PDF document) against upper edge of the page.
     * @param {number} r Radius (in units declared at inception of PDF document).
     * @param {string} style A string specifying the painting style or null.  Valid styles include: 'S' [default] - stroke, 'F' - fill,  and 'DF' (or 'FD') -  fill then stroke. A null value postpones setting the style so that a shape may be composed using multiple method calls. The last drawing method call used to define the shape should not have a null style argument.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name circle
     */
    var circle = API.__private__.circle = API.circle = function (x, y, r, style) {
      if (isNaN(x) || isNaN(y) || isNaN(r) || !isValidStyle(style)) {
        throw new Error('Invalid arguments passed to jsPDF.circle');
      }
      return this.ellipse(x, y, r, r, style);
    };

    /**
     * Sets text font face, variant for upcoming text elements.
     * See output of jsPDF.getFontList() for possible font names, styles.
     *
     * @param {string} fontName Font name or family. Example: "times".
     * @param {string} fontStyle Font style or variant. Example: "italic".
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setFont
     */
    API.setFont = function (fontName, fontStyle) {
      activeFontKey = getFont(fontName, fontStyle, {
        disableWarning: false
      });
      return this;
    };

    /**
     * Switches font style or variant for upcoming text elements,
     * while keeping the font face or family same.
     * See output of jsPDF.getFontList() for possible font names, styles.
     *
     * @param {string} style Font style or variant. Example: "italic".
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setFontStyle
     */
    API.setFontStyle = API.setFontType = function (style) {
      activeFontKey = getFont(undefined, style);
      // if font is not found, the above line blows up and we never go further
      return this;
    };

    /**
     * Returns an object - a tree of fontName to fontStyle relationships available to
     * active PDF document.
     *
     * @public
     * @function
     * @instance
     * @returns {Object} Like {'times':['normal', 'italic', ... ], 'arial':['normal', 'bold', ... ], ... }
     * @memberOf jsPDF
     * @name getFontList
     */
    var getFontList = API.__private__.getFontList = API.getFontList = function () {
      // TODO: iterate over fonts array or return copy of fontmap instead in case more are ever added.
      var list = {},
          fontName, fontStyle, tmp;

      for (fontName in fontmap) {
        if (fontmap.hasOwnProperty(fontName)) {
          list[fontName] = tmp = [];
          for (fontStyle in fontmap[fontName]) {
            if (fontmap[fontName].hasOwnProperty(fontStyle)) {
              tmp.push(fontStyle);
            }
          }
        }
      }

      return list;
    };

    /**
     * Add a custom font to the current instance.
     *
     * @property {string} postScriptName PDF specification full name for the font.
     * @property {string} id PDF-document-instance-specific label assinged to the font.
     * @property {string} fontStyle Style of the Font.
     * @property {Object} encoding Encoding_name-to-Font_metrics_object mapping.
     * @function
     * @instance
     * @memberOf jsPDF
     * @name addFont
     */
    API.addFont = function (postScriptName, fontName, fontStyle, encoding) {
      encoding = encoding || 'Identity-H';
      addFont.call(this, postScriptName, fontName, fontStyle, encoding);
    };

    var lineWidth = options.lineWidth || 0.200025; // 2mm
    /**
     * Sets line width for upcoming lines.
     *
     * @param {number} width Line width (in units declared at inception of PDF document).
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setLineWidth
     */
    var setLineWidth = API.__private__.setLineWidth = API.setLineWidth = function (width) {
      out((width * k).toFixed(2) + ' w');
      return this;
    };

    /**
     * Sets the dash pattern for upcoming lines.
     *
     * To reset the settings simply call the method without any parameters.
     * @param {array} dashArray The pattern of the line, expects numbers.
     * @param {number} dashPhase The phase at which the dash pattern starts.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setLineDash
     */
    var setLineDash = API.__private__.setLineDash = jsPDF.API.setLineDash = function (dashArray, dashPhase) {
      dashArray = dashArray || [];
      dashPhase = dashPhase || 0;

      if (isNaN(dashPhase) || !Array.isArray(dashArray)) {
        throw new Error('Invalid arguments passed to jsPDF.setLineDash');
      }

      dashArray = dashArray.map(function (x) {return (x * k).toFixed(3)}).join(' ');
      dashPhase = parseFloat((dashPhase * k).toFixed(3));

      out('[' + dashArray + '] ' + dashPhase + ' d');
      return this;
    };

    var lineHeightFactor;

    var getLineHeight = API.__private__.getLineHeight = API.getLineHeight = function () {
      return activeFontSize * lineHeightFactor;
    };

    var lineHeightFactor;

    var getLineHeight = API.__private__.getLineHeight = API.getLineHeight = function () {
      return activeFontSize * lineHeightFactor;
    };

    /**
     * Sets the LineHeightFactor of proportion.
     *
     * @param {number} value LineHeightFactor value. Default: 1.15.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setLineHeightFactor
     */
    var setLineHeightFactor = API.__private__.setLineHeightFactor = API.setLineHeightFactor = function (value) {
      value = value || 1.15;
      if (typeof value === "number") {
        lineHeightFactor = value;
      }
      return this;
    };

    /**
     * Gets the LineHeightFactor, default: 1.15.
     *
     * @function
     * @instance
     * @returns {number} lineHeightFactor
     * @memberOf jsPDF
     * @name getLineHeightFactor
     */
    var getLineHeightFactor = API.__private__.getLineHeightFactor = API.getLineHeightFactor = function () {
      return lineHeightFactor;
    };

    setLineHeightFactor(options.lineHeight);

    var getHorizontalCoordinate = API.__private__.getHorizontalCoordinate = function (value) {
      return value * k;
    };

    var getVerticalCoordinate = API.__private__.getVerticalCoordinate = function (value) {
      return pagesContext[currentPage].mediaBox.topRightY - pagesContext[currentPage].mediaBox.bottomLeftY - (value * k);
    };

    var getHorizontalCoordinateString = API.__private__.getHorizontalCoordinateString = function (value) {
      return f2(value * k);
    };

    var getVerticalCoordinateString = API.__private__.getVerticalCoordinateString = function (value) {
      return f2(pagesContext[currentPage].mediaBox.topRightY - pagesContext[currentPage].mediaBox.bottomLeftY - (value * k));
    };

    var strokeColor = options.strokeColor || '0 G';

    /**
     *  Gets the stroke color for upcoming elements.
     *
     * @function
     * @instance
     * @returns {string} colorAsHex
     * @memberOf jsPDF
     * @name getDrawColor
     */
    var getStrokeColor = API.__private__.getStrokeColor = API.getDrawColor = function () {
      return decodeColorString(strokeColor);
    }

    /**
     * Sets the stroke color for upcoming elements.
     *
     * Depending on the number of arguments given, Gray, RGB, or CMYK
     * color space is implied.
     *
     * When only ch1 is given, "Gray" color space is implied and it
     * must be a value in the range from 0.00 (solid black) to to 1.00 (white)
     * if values are communicated as String types, or in range from 0 (black)
     * to 255 (white) if communicated as Number type.
     * The RGB-like 0-255 range is provided for backward compatibility.
     *
     * When only ch1,ch2,ch3 are given, "RGB" color space is implied and each
     * value must be in the range from 0.00 (minimum intensity) to to 1.00
     * (max intensity) if values are communicated as String types, or
     * from 0 (min intensity) to to 255 (max intensity) if values are communicated
     * as Number types.
     * The RGB-like 0-255 range is provided for backward compatibility.
     *
     * When ch1,ch2,ch3,ch4 are given, "CMYK" color space is implied and each
     * value must be a in the range from 0.00 (0% concentration) to to
     * 1.00 (100% concentration)
     *
     * Because JavaScript treats fixed point numbers badly (rounds to
     * floating point nearest to binary representation) it is highly advised to
     * communicate the fractional numbers as String types, not JavaScript Number type.
     *
     * @param {Number|String} ch1 Color channel value or {string} ch1 color value in hexadecimal, example: '#FFFFFF'.
     * @param {Number|String} ch2 Color channel value.
     * @param {Number|String} ch3 Color channel value.
     * @param {Number|String} ch4 Color channel value.
     *
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setDrawColor
     */
    var setStrokeColor = API.__private__.setStrokeColor = API.setDrawColor = function (ch1, ch2, ch3, ch4) {
      var options = {
        "ch1": ch1,
        "ch2": ch2,
        "ch3": ch3,
        "ch4": ch4,
        "pdfColorType": "draw",
        "precision": 2
      };

      strokeColor = encodeColorString(options);
      out(strokeColor);
      return this;
    };

    var fillColor = options.fillColor || '0 g';

    /**
     * Gets the fill color for upcoming elements.
     *
     * @function
     * @instance
     * @returns {string} colorAsHex
     * @memberOf jsPDF
     * @name getFillColor
     */
    var getFillColor = API.__private__.getFillColor = API.getFillColor = function () {
      return decodeColorString(fillColor);
    }
    /**
     * Sets the fill color for upcoming elements.
     *
     * Depending on the number of arguments given, Gray, RGB, or CMYK
     * color space is implied.
     *
     * When only ch1 is given, "Gray" color space is implied and it
     * must be a value in the range from 0.00 (solid black) to to 1.00 (white)
     * if values are communicated as String types, or in range from 0 (black)
     * to 255 (white) if communicated as Number type.
     * The RGB-like 0-255 range is provided for backward compatibility.
     *
     * When only ch1,ch2,ch3 are given, "RGB" color space is implied and each
     * value must be in the range from 0.00 (minimum intensity) to to 1.00
     * (max intensity) if values are communicated as String types, or
     * from 0 (min intensity) to to 255 (max intensity) if values are communicated
     * as Number types.
     * The RGB-like 0-255 range is provided for backward compatibility.
     *
     * When ch1,ch2,ch3,ch4 are given, "CMYK" color space is implied and each
     * value must be a in the range from 0.00 (0% concentration) to to
     * 1.00 (100% concentration)
     *
     * Because JavaScript treats fixed point numbers badly (rounds to
     * floating point nearest to binary representation) it is highly advised to
     * communicate the fractional numbers as String types, not JavaScript Number type.
     *
     * @param {Number|String} ch1 Color channel value or {string} ch1 color value in hexadecimal, example: '#FFFFFF'.
     * @param {Number|String} ch2 Color channel value.
     * @param {Number|String} ch3 Color channel value.
     * @param {Number|String} ch4 Color channel value.
     *
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setFillColor
     */
    var setFillColor = API.__private__.setFillColor = API.setFillColor = function (ch1, ch2, ch3, ch4) {
      var options = {
        "ch1": ch1,
        "ch2": ch2,
        "ch3": ch3,
        "ch4": ch4,
        "pdfColorType": "fill",
        "precision": 2
      };

      fillColor = encodeColorString(options);
      out(fillColor);
      return this;
    };

    var textColor = options.textColor || '0 g';
    /**
     * Gets the text color for upcoming elements.
     *
     * @function
     * @instance
     * @returns {string} colorAsHex
     * @memberOf jsPDF
     * @name getTextColor
     */
    var getTextColor = API.__private__.getTextColor = API.getTextColor = function () {
      return decodeColorString(textColor);
    }
    /**
     * Sets the text color for upcoming elements.
     *
     * Depending on the number of arguments given, Gray, RGB, or CMYK
     * color space is implied.
     *
     * When only ch1 is given, "Gray" color space is implied and it
     * must be a value in the range from 0.00 (solid black) to to 1.00 (white)
     * if values are communicated as String types, or in range from 0 (black)
     * to 255 (white) if communicated as Number type.
     * The RGB-like 0-255 range is provided for backward compatibility.
     *
     * When only ch1,ch2,ch3 are given, "RGB" color space is implied and each
     * value must be in the range from 0.00 (minimum intensity) to to 1.00
     * (max intensity) if values are communicated as String types, or
     * from 0 (min intensity) to to 255 (max intensity) if values are communicated
     * as Number types.
     * The RGB-like 0-255 range is provided for backward compatibility.
     *
     * When ch1,ch2,ch3,ch4 are given, "CMYK" color space is implied and each
     * value must be a in the range from 0.00 (0% concentration) to to
     * 1.00 (100% concentration)
     *
     * Because JavaScript treats fixed point numbers badly (rounds to
     * floating point nearest to binary representation) it is highly advised to
     * communicate the fractional numbers as String types, not JavaScript Number type.
     *
     * @param {Number|String} ch1 Color channel value or {string} ch1 color value in hexadecimal, example: '#FFFFFF'.
     * @param {Number|String} ch2 Color channel value.
     * @param {Number|String} ch3 Color channel value.
     * @param {Number|String} ch4 Color channel value.
     *
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setTextColor
     */
    var setTextColor = API.__private__.setTextColor = API.setTextColor = function (ch1, ch2, ch3, ch4) {
      var options = {
        "ch1": ch1,
        "ch2": ch2,
        "ch3": ch3,
        "ch4": ch4,
        "pdfColorType": "text",
        "precision": 3
      };
      textColor = encodeColorString(options);

      return this;
    };

    var activeCharSpace = options.charSpace || 0;

    /**
     * Get global value of CharSpace.
     *
     * @function
     * @instance
     * @returns {number} charSpace
     * @memberOf jsPDF
     * @name getCharSpace
     */
    var getCharSpace = API.__private__.getCharSpace = API.getCharSpace = function () {
      return activeCharSpace;
    };

    /**
     * Set global value of CharSpace.
     *
     * @param {number} charSpace
     * @function
     * @instance
     * @returns {jsPDF} jsPDF-instance
     * @memberOf jsPDF
     * @name setCharSpace
     */
    var setCharSpace = API.__private__.setCharSpace = API.setCharSpace = function (charSpace) {
      if (isNaN(charSpace)) {
        throw new Error('Invalid argument passed to jsPDF.setCharSpace');
      }
      activeCharSpace = charSpace;
      return this;
    };

    var lineCapID = 0;
    /**
     * Is an Object providing a mapping from human-readable to
     * integer flag values designating the varieties of line cap
     * and join styles.
     *
     * @memberOf jsPDF
     * @name CapJoinStyles
     */
    API.CapJoinStyles = {
      0: 0,
      'butt': 0,
      'but': 0,
      'miter': 0,
      1: 1,
      'round': 1,
      'rounded': 1,
      'circle': 1,
      2: 2,
      'projecting': 2,
      'project': 2,
      'square': 2,
      'bevel': 2
    };

    /**
     * Sets the line cap styles.
     * See {jsPDF.CapJoinStyles} for variants.
     *
     * @param {String|Number} style A string or number identifying the type of line cap.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setLineCap
     */
    var setLineCap = API.__private__.setLineCap = API.setLineCap = function (style) {
      var id = API.CapJoinStyles[style];
      if (id === undefined) {
        throw new Error("Line cap style of '" + style + "' is not recognized. See or extend .CapJoinStyles property for valid styles");
      }
      lineCapID = id;
      out(id + ' J');

      return this;
    };

    var lineJoinID = 0;
    /**
     * Sets the line join styles.
     * See {jsPDF.CapJoinStyles} for variants.
     *
     * @param {String|Number} style A string or number identifying the type of line join.
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setLineJoin
     */
    var setLineJoin = API.__private__.setLineJoin = API.setLineJoin = function (style) {
      var id = API.CapJoinStyles[style];
      if (id === undefined) {
        throw new Error("Line join style of '" + style + "' is not recognized. See or extend .CapJoinStyles property for valid styles");
      }
      lineJoinID = id;
      out(id + ' j');

      return this;
    };

    var miterLimit;
    /**
     * Sets the miterLimit property, which effects the maximum miter length.
     *
     * @param {number} length The length of the miter
     * @function
     * @instance
     * @returns {jsPDF}
     * @memberOf jsPDF
     * @name setMiterLimit
     */
    var setMiterLimit = API.__private__.setMiterLimit = API.setMiterLimit = function (length) {
      length = length || 0;
      if (isNaN(length)) {
        throw new Error('Invalid argument passed to jsPDF.setMiterLimit');
      }
      miterLimit = parseFloat(f2(length * k));
      out(miterLimit + ' M');

      return this;
    };

    /**
     * Saves as PDF document. An alias of jsPDF.output('save', 'filename.pdf').
     * Uses FileSaver.js-method saveAs.
     *
     * @memberOf jsPDF
     * @name save
     * @function
     * @instance
     * @param  {string} filename The filename including extension.
     * @param  {Object} options An Object with additional options, possible options: 'returnPromise'.
     * @returns {jsPDF} jsPDF-instance
     */
    API.save = function (filename, options) {
      filename = filename || 'generated.pdf';

      options = options || {};
      options.returnPromise = options.returnPromise || false;

      if (options.returnPromise === false) {
        saveAs(getBlob(buildDocument()), filename);
        if (typeof saveAs.unload === 'function') {
          if (global.setTimeout) {
            setTimeout(saveAs.unload, 911);
          }
        }
      } else {
        return new Promise(function(resolve, reject) {
          try {
            var result = saveAs(getBlob(buildDocument()), filename);
            if (typeof saveAs.unload === 'function') {
              if (global.setTimeout) {
                setTimeout(saveAs.unload, 911);
              }
            }
            resolve(result);
          } catch(e) {
            reject(e.message);
          }
        });
      }
    };

    // applying plugins (more methods) ON TOP of built-in API.
    // this is intentional as we allow plugins to override
    // built-ins
    for (var plugin in jsPDF.API) {
      if (jsPDF.API.hasOwnProperty(plugin)) {
        if (plugin === 'events' && jsPDF.API.events.length) {
          (function (events, newEvents) {

            // jsPDF.API.events is a JS Array of Arrays
            // where each Array is a pair of event name, handler
            // Events were added by plugins to the jsPDF instantiator.
            // These are always added to the new instance and some ran
            // during instantiation.
            var eventname, handler_and_args, i;

            for (i = newEvents.length - 1; i !== -1; i--) {
              // subscribe takes 3 args: 'topic', function, runonce_flag
              // if undefined, runonce is false.
              // users can attach callback directly,
              // or they can attach an array with [callback, runonce_flag]
              // that's what the "apply" magic is for below.
              eventname = newEvents[i][0];
              handler_and_args = newEvents[i][1];
              events.subscribe.apply(
                  events, [eventname].concat(
                      typeof handler_and_args === 'function' ? [
                        handler_and_args
                      ] : handler_and_args));
            }
          }(events, jsPDF.API.events));
        } else {
          API[plugin] = jsPDF.API[plugin];
        }
      }
    }

    /**
     * Object exposing internal API to plugins
     * @public
     * @ignore
     */
    API.internal = {
      'pdfEscape': pdfEscape,
      'getStyle': getStyle,
      'getFont': function () {
        return fonts[getFont.apply(API, arguments)];
      },
      'getFontSize': getFontSize,
      'getCharSpace': getCharSpace,
      'getTextColor': getTextColor,
      'getLineHeight': getLineHeight,
      'getLineHeightFactor' : getLineHeightFactor,
      'write': write,
      'getHorizontalCoordinate': getHorizontalCoordinate,
      'getVerticalCoordinate': getVerticalCoordinate,
      'getCoordinateString': getHorizontalCoordinateString,
      'getVerticalCoordinateString': getVerticalCoordinateString,
      'collections': {},
      'newObject': newObject,
      'newAdditionalObject': newAdditionalObject,
      'newObjectDeferred': newObjectDeferred,
      'newObjectDeferredBegin': newObjectDeferredBegin,
      'getFilters': getFilters,
      'putStream': putStream,
      'events': events,
      // ratio that you use in multiplication of a given "size" number to arrive to 'point'
      // units of measurement.
      // scaleFactor is set at initialization of the document and calculated against the stated
      // default measurement units for the document.
      // If default is "mm", k is the number that will turn number in 'mm' into 'points' number.
      // through multiplication.
      'scaleFactor': k,
      'pageSize': {
        getWidth: function () {
          return (pagesContext[currentPage].mediaBox.topRightX - pagesContext[currentPage].mediaBox.bottomLeftX) / k;
        },
        setWidth: function (value) {
          pagesContext[currentPage].mediaBox.topRightX = (value * k) + pagesContext[currentPage].mediaBox.bottomLeftX;
        },
        getHeight: function () {
          return (pagesContext[currentPage].mediaBox.topRightY - pagesContext[currentPage].mediaBox.bottomLeftY) / k;
        },
        setHeight: function (value) {
          pagesContext[currentPage].mediaBox.topRightY = (value * k) + pagesContext[currentPage].mediaBox.bottomLeftY;
        },
      },
      'output': output,
      'getNumberOfPages': getNumberOfPages,
      'pages': pages,
      'out': out,
      'f2': f2,
      'f3': f3,
      'getPageInfo': getPageInfo,
      'getPageInfoByObjId': getPageInfoByObjId,
      'getCurrentPageInfo': getCurrentPageInfo,
      'getPDFVersion': getPdfVersion,
      'hasHotfix': hasHotfix //Expose the hasHotfix check so plugins can also check them.
    };

    Object.defineProperty(API.internal.pageSize, 'width', {
      get: function () {
        return (pagesContext[currentPage].mediaBox.topRightX - pagesContext[currentPage].mediaBox.bottomLeftX) / k;
      },
      set: function (value) {
        pagesContext[currentPage].mediaBox.topRightX = (value * k) + pagesContext[currentPage].mediaBox.bottomLeftX;
      },
      enumerable: true,
      configurable: true
    });
    Object.defineProperty(API.internal.pageSize, 'height', {
      get: function () {
        return (pagesContext[currentPage].mediaBox.topRightY - pagesContext[currentPage].mediaBox.bottomLeftY) / k;
      },
      set: function (value) {
        pagesContext[currentPage].mediaBox.topRightY = (value * k) + pagesContext[currentPage].mediaBox.bottomLeftY;
      },
      enumerable: true,
      configurable: true
    });


    //////////////////////////////////////////////////////
    // continuing initialization of jsPDF Document object
    //////////////////////////////////////////////////////
    // Add the first page automatically
    addFonts(standardFonts);
    activeFontKey = 'F1';
    _addPage(format, orientation);

    events.publish('initialized');
    return API;
  }

  /**
   * jsPDF.API is a STATIC property of jsPDF class.
   * jsPDF.API is an object you can add methods and properties to.
   * The methods / properties you add will show up in new jsPDF objects.
   *
   * One property is prepopulated. It is the 'events' Object. Plugin authors can add topics,
   * callbacks to this object. These will be reassigned to all new instances of jsPDF.
   *
   * @static
   * @public
   * @memberOf jsPDF
   * @name API
   *
   * @example
   * jsPDF.API.mymethod = function(){
   *   // 'this' will be ref to internal API object. see jsPDF source
   *   // , so you can refer to built-in methods like so:
   *   //     this.line(....)
   *   //     this.text(....)
   * }
   * var pdfdoc = new jsPDF()
   * pdfdoc.mymethod() // <- !!!!!!
   */
  jsPDF.API = {
    events: []
  };
  /**
   * The version of jsPDF.
   * @name version
   * @type {string}
   * @memberOf jsPDF
   */
  jsPDF.version = '0.0.0';

  if (typeof define === 'function' && define.amd) {
    define('jsPDF', function () {
      return jsPDF;
    });
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = jsPDF;
    module.exports.jsPDF = jsPDF;
  } else {
    global.jsPDF = jsPDF;
  }
  return jsPDF;
}(typeof self !== "undefined" && self || typeof window !== "undefined" && window || typeof global !== "undefined" && global || Function('return typeof this === "object" && this.content')() || Function('return this')()));
// `self` is undefined in Firefox for Android content script context
// while `this` is nsIContentFrameMessageManager
// with an attribute `content` that corresponds to the window


/** @license
 * jsPDF addImage plugin
 * Copyright (c) 2012 Jason Siefken, https://github.com/siefkenj/
 *               2013 Chris Dowling, https://github.com/gingerchris
 *               2013 Trinh Ho, https://github.com/ineedfat
 *               2013 Edwin Alejandro Perez, https://github.com/eaparango
 *               2013 Norah Smith, https://github.com/burnburnrocket
 *               2014 Diego Casorran, https://github.com/diegocr
 *               2014 James Robb, https://github.com/jamesbrobb
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
/**
 * @name addImage
 * @module
 */
(function(jsPDFAPI) {
  'use strict'

  var namespace = 'addImage_';

  var imageFileTypeHeaders = {
    PNG : [[0x89, 0x50, 0x4e, 0x47]],
    TIFF: [
      [0x4D,0x4D,0x00,0x2A], //Motorola
      [0x49,0x49,0x2A,0x00]  //Intel
    ],
    JPEG: [
      [0xFF, 0xD8, 0xFF, 0xE0, undefined, undefined, 0x4A, 0x46, 0x49, 0x46, 0x00],      //JFIF
      [0xFF, 0xD8, 0xFF, 0xE1, undefined, undefined, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00] //Exif
    ],
    JPEG2000: [[0x00, 0x00, 0x00, 0x0C, 0x6A, 0x50, 0x20, 0x20]],
    GIF87a: [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61]],
    GIF89a: [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    BMP: [
      [0x42, 0x4D], //BM - Windows 3.1x, 95, NT, ... etc.
      [0x42, 0x41], //BA - OS/2 struct bitmap array
      [0x43, 0x49], //CI - OS/2 struct color icon
      [0x43, 0x50], //CP - OS/2 const color pointer
      [0x49, 0x43], //IC - OS/2 struct icon
      [0x50, 0x54]  //PT - OS/2 pointer
    ]
  };

  /**
   * Recognize filetype of Image by magic-bytes
   *
   * https://en.wikipedia.org/wiki/List_of_file_signatures
   *
   * @name getImageFileTypeByImageData
   * @public
   * @function
   * @param {string|arraybuffer} imageData imageData as binary String or arraybuffer
   * @param {string} format format of file if filetype-recognition fails, e.g. 'JPEG'
   *
   * @returns {string} filetype of Image
   */
  var getImageFileTypeByImageData = jsPDFAPI.getImageFileTypeByImageData = function (imageData, fallbackFormat) {
    fallbackFormat = fallbackFormat || 'UNKNOWN';
    var i;
    var j;
    var result = 'UNKNOWN';
    var headerSchemata;
    var compareResult;
    var fileType;

    if (jsPDFAPI.isArrayBufferView(imageData)) {
      imageData = jsPDFAPI.arrayBufferToBinaryString(imageData);
    }

    for (fileType in imageFileTypeHeaders) {
      headerSchemata = imageFileTypeHeaders[fileType];
      for (i = 0; i < headerSchemata.length; i += 1) {
        compareResult = true;
        for (j = 0; j < headerSchemata[i].length; j += 1) {
          if (headerSchemata[i][j] === undefined) {
            continue;
          }
          if (headerSchemata[i][j] !== imageData.charCodeAt(j)) {
            compareResult = false;
            break;
          }
        }
        if (compareResult === true) {
          result = fileType;
          break;
        }
      }
    }
    if (result === 'UNKNOWN' && fallbackFormat !== 'UNKNOWN' ) {
      console.warn('FileType of Image not recognized. Processing image as "' + fallbackFormat + '".');
      result = fallbackFormat;
    }
    return result;
  }

  // Image functionality ported from pdf.js
  var putImage = function(img) {

    var objectNumber = this.internal.newObject()
        , out = this.internal.write
        , putStream = this.internal.putStream
        , getFilters = this.internal.getFilters

    var filters = getFilters();
    while (filters.indexOf('FlateEncode') !== -1) {
      filters.splice( filters.indexOf('FlateEncode'), 1 );
    }
    img['n'] = objectNumber

    var additionalKeyValues = [];
    additionalKeyValues.push({key: 'Type', value: '/XObject'});
    additionalKeyValues.push({key: 'Subtype', value: '/Image'});
    additionalKeyValues.push({key: 'Width', value: img['w']});
    additionalKeyValues.push({key: 'Height', value: img['h']});
    if (img['cs'] === this.color_spaces.INDEXED) {
      additionalKeyValues.push({key: 'ColorSpace', value: '[/Indexed /DeviceRGB '
            // if an indexed png defines more than one colour with transparency, we've created a smask
            + (img['pal'].length / 3 - 1) + ' ' + ('smask' in img ? objectNumber + 2 : objectNumber + 1)
            + ' 0 R]'});
    } else {
      additionalKeyValues.push({key: 'ColorSpace', value: '/' + img['cs']});
      if (img['cs'] === this.color_spaces.DEVICE_CMYK) {
        additionalKeyValues.push({key: 'Decode', value: '[1 0 1 0 1 0 1 0]'});
      }
    }
    additionalKeyValues.push({key: 'BitsPerComponent', value: img['bpc']});
    if ('dp' in img) {
      additionalKeyValues.push({key: 'DecodeParms', value: '<<' + img['dp'] + '>>'});
    }
    if ('trns' in img && img['trns'].constructor == Array) {
      var trns = '',
          i = 0,
          len = img['trns'].length;
      for (; i < len; i++)
        trns += (img['trns'][i] + ' ' + img['trns'][i] + ' ');

      additionalKeyValues.push({key: 'Mask', value: '[' + trns + ']'});
    }
    if ('smask' in img) {
      additionalKeyValues.push({key: 'SMask', value: (objectNumber + 1) + ' 0 R'});
    }

    var alreadyAppliedFilters = (typeof img['f'] !== "undefined") ? ['/' + img['f']] : undefined;

    putStream({data: img['data'], additionalKeyValues: additionalKeyValues, alreadyAppliedFilters: alreadyAppliedFilters});

    out('endobj');

    // Soft mask
    if ('smask' in img) {
      var dp = '/Predictor '+ img['p'] +' /Colors 1 /BitsPerComponent ' + img['bpc'] + ' /Columns ' + img['w'];
      var smask = {'w': img['w'], 'h': img['h'], 'cs': 'DeviceGray', 'bpc': img['bpc'], 'dp': dp, 'data': img['smask']};
      if ('f' in img)
        smask.f = img['f'];
      putImage.call(this, smask);
    }

    //Palette
    if (img['cs'] === this.color_spaces.INDEXED) {

      this.internal.newObject();
      //out('<< /Filter / ' + img['f'] +' /Length ' + img['pal'].length + '>>');
      //putStream(zlib.compress(img['pal']));
      putStream({data: this.arrayBufferToBinaryString(new Uint8Array(img['pal']))});
      out('endobj');
    }
  }
      , putResourcesCallback = function() {
    var images = this.internal.collections[namespace + 'images']
    for ( var i in images ) {
      putImage.call(this, images[i])
    }
  }
      , putXObjectsDictCallback = function(){
    var images = this.internal.collections[namespace + 'images']
        , out = this.internal.write
        , image
    for (var i in images) {
      image = images[i]
      out(
          '/I' + image['i']
          , image['n']
          , '0'
          , 'R'
      )
    }
  }
      , checkCompressValue = function(value) {
    if(value && typeof value === 'string')
      value = value.toUpperCase();
    return value in jsPDFAPI.image_compression ? value : jsPDFAPI.image_compression.NONE;
  }
      , getImages = function() {
    var images = this.internal.collections[namespace + 'images'];
    //first run, so initialise stuff
    if(!images) {
      this.internal.collections[namespace + 'images'] = images = {};
      this.internal.events.subscribe('putResources', putResourcesCallback);
      this.internal.events.subscribe('putXobjectDict', putXObjectsDictCallback);
    }

    return images;
  }
      , getImageIndex = function(images) {
    var imageIndex = 0;

    if (images){
      // this is NOT the first time this method is ran on this instance of jsPDF object.
      imageIndex = Object.keys ?
          Object.keys(images).length :
          (function(o){
            var i = 0
            for (var e in o){if(o.hasOwnProperty(e)){ i++ }}
            return i
          })(images)
    }

    return imageIndex;
  }
      , notDefined = function(value) {
    return typeof value === 'undefined' || value === null || value.length === 0;
  }
      , generateAliasFromImageData = function(imageData) {
    if (typeof imageData === 'string') {
      return jsPDFAPI.sHashCode(imageData);
    }

    if (jsPDFAPI.isArrayBufferView(imageData)) {
      return jsPDFAPI.sHashCode(jsPDFAPI.arrayBufferToBinaryString(imageData));
    }

    return null;
  }
      , isImageTypeSupported = function(type) {
    return (typeof jsPDFAPI["process" + type.toUpperCase()] === "function");
  }
      , isDOMElement = function(object) {
    return typeof object === 'object' && object.nodeType === 1;
  }
      , createDataURIFromElement = function(element, format) {
    //if element is an image which uses data url definition, just return the dataurl
    if (element.nodeName === 'IMG' && element.hasAttribute('src')) {
      var src = ''+element.getAttribute('src');

      //is base64 encoded dataUrl, directly process it
      if (src.indexOf('data:image/') === 0) {
        return unescape(src);
      }

      //it is probably an url, try to load it
      var tmpImageData = jsPDFAPI.loadFile(src);
      if (tmpImageData !== undefined) {
        return btoa(tmpImageData)
      }
    }

    if(element.nodeName === 'CANVAS') {
      var canvas = element;
      return element.toDataURL('image/jpeg', 1.0);
    }
    //absolute fallback method
    var canvas = document.createElement('canvas');
    canvas.width = element.clientWidth || element.width;
    canvas.height = element.clientHeight || element.height;

    var ctx = canvas.getContext('2d');
    if (!ctx) {
      throw ('addImage requires canvas to be supported by browser.');
    }
    ctx.drawImage(element, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL((''+format).toLowerCase() == 'png' ? 'image/png' : 'image/jpeg');
  }
      ,checkImagesForAlias = function(alias, images) {
    var cached_info;
    if(images) {
      for(var e in images) {
        if(alias === images[e].alias) {
          cached_info = images[e];
          break;
        }
      }
    }
    return cached_info;
  }
      ,determineWidthAndHeight = function(w, h, info) {
    if (!w && !h) {
      w = -96;
      h = -96;
    }
    if (w < 0) {
      w = (-1) * info['w'] * 72 / w / this.internal.scaleFactor;
    }
    if (h < 0) {
      h = (-1) * info['h'] * 72 / h / this.internal.scaleFactor;
    }
    if (w === 0) {
      w = h * info['w'] / info['h'];
    }
    if (h === 0) {
      h = w * info['h'] / info['w'];
    }

    return [w, h];
  }
      , writeImageToPDF = function(x, y, w, h, info, index, images, rotation) {
    var dims = determineWidthAndHeight.call(this, w, h, info),
        coord = this.internal.getCoordinateString,
        vcoord = this.internal.getVerticalCoordinateString;

    w = dims[0];
    h = dims[1];

    images[index] = info;

    if (rotation) {
      rotation *= (Math.PI / 180);
      var c = Math.cos(rotation);
      var s = Math.sin(rotation);
      //like in pdf Reference do it 4 digits instead of 2
      var f4 = function(number) {
        return number.toFixed(4);
      }
      var rotationTransformationMatrix = [f4(c), f4(s), f4(s * -1), f4(c), 0, 0, 'cm'];
    }
    this.internal.write('q'); //Save graphics state
    if (rotation) {
      this.internal.write([1, '0', '0' , 1, coord(x), vcoord(y + h), 'cm'].join(' '));  //Translate
      this.internal.write(rotationTransformationMatrix.join(' ')); //Rotate
      this.internal.write([coord(w), '0', '0' , coord(h), '0', '0', 'cm'].join(' '));  //Scale
    } else {
      this.internal.write([coord(w), '0', '0' , coord(h), coord(x), vcoord(y + h), 'cm'].join(' '));  //Translate and Scale
    }
    this.internal.write('/I'+info['i'] + ' Do'); //Paint Image
    this.internal.write('Q'); //Restore graphics state
  };

  /**
   * COLOR SPACES
   */
  jsPDFAPI.color_spaces = {
    DEVICE_RGB:'DeviceRGB',
    DEVICE_GRAY:'DeviceGray',
    DEVICE_CMYK:'DeviceCMYK',
    CAL_GREY:'CalGray',
    CAL_RGB:'CalRGB',
    LAB:'Lab',
    ICC_BASED:'ICCBased',
    INDEXED:'Indexed',
    PATTERN:'Pattern',
    SEPARATION:'Separation',
    DEVICE_N:'DeviceN'
  };

  /**
   * DECODE METHODS
   */
  jsPDFAPI.decode = {
    DCT_DECODE:'DCTDecode',
    FLATE_DECODE:'FlateDecode',
    LZW_DECODE:'LZWDecode',
    JPX_DECODE:'JPXDecode',
    JBIG2_DECODE:'JBIG2Decode',
    ASCII85_DECODE:'ASCII85Decode',
    ASCII_HEX_DECODE:'ASCIIHexDecode',
    RUN_LENGTH_DECODE:'RunLengthDecode',
    CCITT_FAX_DECODE:'CCITTFaxDecode'
  };

  /**
   * IMAGE COMPRESSION TYPES
   */
  jsPDFAPI.image_compression = {
    NONE: 'NONE',
    FAST: 'FAST',
    MEDIUM: 'MEDIUM',
    SLOW: 'SLOW'
  };

  /**
   * @name sHashCode
   * @function
   * @param {string} str
   * @returns {string}
   */
  jsPDFAPI.sHashCode = function(str) {
    str = str || "";
    var hash = 0, i, chr;
    if (str.length === 0) return hash;
    for (i = 0; i < str.length; i++) {
      chr   = str.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  };

  /**
   * Validates if given String is a valid Base64-String
   *
   * @name validateStringAsBase64
   * @public
   * @function
   * @param {String} possible Base64-String
   *
   * @returns {boolean}
   */
  jsPDFAPI.validateStringAsBase64 = function(possibleBase64String) {
    possibleBase64String = possibleBase64String || '';
    possibleBase64String.toString().trim();

    var result = true;

    if (possibleBase64String.length === 0) {
      result = false;
    }

    if (possibleBase64String.length % 4 !== 0) {
      result = false;
    }

    if (/^[A-Za-z0-9+\/]+$/.test(possibleBase64String.substr(0, possibleBase64String.length - 2)) === false) {
      result = false;
    }


    if (/^[A-Za-z0-9\/][A-Za-z0-9+\/]|[A-Za-z0-9+\/]=|==$/.test(possibleBase64String.substr(-2)) === false) {
      result = false;
    }
    return result;
  };

  /**
   * Strips out and returns info from a valid base64 data URI
   *
   * @name extractInfoFromBase64DataURI
   * @function
   * @param {string} dataUrl a valid data URI of format 'data:[<MIME-type>][;base64],<data>'
   * @returns {Array}an Array containing the following
   * [0] the complete data URI
   * [1] <MIME-type>
   * [2] format - the second part of the mime-type i.e 'png' in 'image/png'
   * [4] <data>
   */
  jsPDFAPI.extractInfoFromBase64DataURI = function(dataURI) {
    return /^data:([\w]+?\/([\w]+?));\S*;*base64,(.+)$/g.exec(dataURI);
  };

  /**
   * Strips out and returns info from a valid base64 data URI
   *
   * @name extractImageFromDataUrl
   * @function
   * @param {string} dataUrl a valid data URI of format 'data:[<MIME-type>][;base64],<data>'
   * @returns {Array}an Array containing the following
   * [0] the complete data URI
   * [1] <MIME-type>
   * [2] format - the second part of the mime-type i.e 'png' in 'image/png'
   * [4] <data>
   */
  jsPDFAPI.extractImageFromDataUrl = function(dataUrl) {
    dataUrl = dataUrl || '';
    var dataUrlParts = dataUrl.split('base64,');
    var result = null;

    if (dataUrlParts.length === 2) {
      var extractedInfo = /^data:(\w*\/\w*);*(charset=[\w=-]*)*;*$/.exec(dataUrlParts[0]);
      if (Array.isArray(extractedInfo)) {
        result = {
          mimeType : extractedInfo[1],
          charset  : extractedInfo[2],
          data     : dataUrlParts[1]
        };
      }
    }
    return result;
  };

  /**
   * Check to see if ArrayBuffer is supported
   *
   * @name supportsArrayBuffer
   * @function
   * @returns {boolean}
   */
  jsPDFAPI.supportsArrayBuffer = function() {
    return typeof ArrayBuffer !== 'undefined' && typeof Uint8Array !== 'undefined';
  };

  /**
   * Tests supplied object to determine if ArrayBuffer
   *
   * @name isArrayBuffer
   * @function
   * @param {Object} object an Object
   *
   * @returns {boolean}
   */
  jsPDFAPI.isArrayBuffer = function(object) {
    if(!this.supportsArrayBuffer())
      return false;
    return object instanceof ArrayBuffer;
  };

  /**
   * Tests supplied object to determine if it implements the ArrayBufferView (TypedArray) interface
   *
   * @name isArrayBufferView
   * @function
   * @param {Object} object an Object
   * @returns {boolean}
   */
  jsPDFAPI.isArrayBufferView = function(object) {
    if(!this.supportsArrayBuffer())
      return false;
    if(typeof Uint32Array === 'undefined')
      return false;
    return (object instanceof Int8Array ||
        object instanceof Uint8Array ||
        (typeof Uint8ClampedArray !== 'undefined' && object instanceof Uint8ClampedArray) ||
        object instanceof Int16Array ||
        object instanceof Uint16Array ||
        object instanceof Int32Array ||
        object instanceof Uint32Array ||
        object instanceof Float32Array ||
        object instanceof Float64Array );
  };


  /**
   * Convert the Buffer to a Binary String
   *
   * @name binaryStringToUint8Array
   * @public
   * @function
   * @param {ArrayBuffer} BinaryString with ImageData
   *
   * @returns {Uint8Array}
   */
  jsPDFAPI.binaryStringToUint8Array = function(binary_string) {
    /*
         * not sure how efficient this will be will bigger files. Is there a native method?
         */
    var len = binary_string.length;
    var bytes = new Uint8Array( len );
    for (var i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
  };

  /**
   * Convert the Buffer to a Binary String
   *
   * @name arrayBufferToBinaryString
   * @public
   * @function
   * @param {ArrayBuffer} ArrayBuffer with ImageData
   *
   * @returns {String}
   */
  jsPDFAPI.arrayBufferToBinaryString = function(buffer) {

    // if (typeof Uint8Array !== 'undefined' && typeof Uint8Array.prototype.reduce !== 'undefined') {
    // return new Uint8Array(buffer).reduce(function (data, byte) {
    // return data.push(String.fromCharCode(byte)), data;
    // }, []).join('');
    // }
    if (typeof atob === "function") {
      return atob(this.arrayBufferToBase64(buffer));
    }
  };

  /**
   * Converts an ArrayBuffer directly to base64
   *
   * Taken from  http://jsperf.com/encoding-xhr-image-data/31
   *
   * Need to test if this is a better solution for larger files
   *
   * @name arrayBufferToBase64
   * @param {arraybuffer} arrayBuffer
   * @public
   * @function
   *
   * @returns {string}
   */
  jsPDFAPI.arrayBufferToBase64 = function(arrayBuffer) {
    var base64    = ''
    var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

    var bytes         = new Uint8Array(arrayBuffer)
    var byteLength    = bytes.byteLength
    var byteRemainder = byteLength % 3
    var mainLength    = byteLength - byteRemainder

    var a, b, c, d
    var chunk

    // Main loop deals with bytes in chunks of 3
    for (var i = 0; i < mainLength; i = i + 3) {
      // Combine the three bytes into a single integer
      chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]

      // Use bitmasks to extract 6-bit segments from the triplet
      a = (chunk & 16515072) >> 18 // 16515072 = (2^6 - 1) << 18
      b = (chunk & 258048)   >> 12 // 258048   = (2^6 - 1) << 12
      c = (chunk & 4032)     >>  6 // 4032     = (2^6 - 1) << 6
      d = chunk & 63               // 63       = 2^6 - 1

      // Convert the raw binary segments to the appropriate ASCII encoding
      base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d]
    }

    // Deal with the remaining bytes and padding
    if (byteRemainder == 1) {
      chunk = bytes[mainLength]

      a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2

      // Set the 4 least significant bits to zero
      b = (chunk & 3)   << 4 // 3   = 2^2 - 1

      base64 += encodings[a] + encodings[b] + '=='
    } else if (byteRemainder == 2) {
      chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1]

      a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
      b = (chunk & 1008)  >>  4 // 1008  = (2^6 - 1) << 4

      // Set the 2 least significant bits to zero
      c = (chunk & 15)    <<  2 // 15    = 2^4 - 1

      base64 += encodings[a] + encodings[b] + encodings[c] + '='
    }

    return base64
  };

  /**
   *
   * @name createImageInfo
   * @param {Object} data
   * @param {number} wd width
   * @param {number} ht height
   * @param {Object} cs colorSpace
   * @param {number} bpc bits per channel
   * @param {any} f
   * @param {number} imageIndex
   * @param {string} alias
   * @param {any} dp
   * @param {any} trns
   * @param {any} pal
   * @param {any} smask
   * @param {any} p
   * @public
   * @function
   *
   * @returns {Object}
   */
  jsPDFAPI.createImageInfo = function(data, wd, ht, cs, bpc, f, imageIndex, alias, dp, trns, pal, smask, p) {
    var info = {
      alias:alias,
      w : wd,
      h : ht,
      cs : cs,
      bpc : bpc,
      i : imageIndex,
      data : data
      // n: objectNumber will be added by putImage code
    };

    if(f) info.f = f;
    if(dp) info.dp = dp;
    if(trns) info.trns = trns;
    if(pal) info.pal = pal;
    if(smask) info.smask = smask;
    if(p) info.p = p;// predictor parameter for PNG compression

    return info;
  };
  /**
   * Adds an Image to the PDF.
   *
   * @name addImage
   * @public
   * @function
   * @param {string/Image-Element/Canvas-Element/Uint8Array} imageData imageData as base64 encoded DataUrl or Image-HTMLElement or Canvas-HTMLElement
   * @param {string} format format of file if filetype-recognition fails, e.g. 'JPEG'
   * @param {number} x x Coordinate (in units declared at inception of PDF document) against left edge of the page
   * @param {number} y y Coordinate (in units declared at inception of PDF document) against upper edge of the page
   * @param {number} width width of the image (in units declared at inception of PDF document)
   * @param {number} height height of the Image (in units declared at inception of PDF document)
   * @param {string} alias alias of the image (if used multiple times)
   * @param {string} compression compression of the generated JPEG, can have the values 'NONE', 'FAST', 'MEDIUM' and 'SLOW'
   * @param {number} rotation rotation of the image in degrees (0-359)
   *
   * @returns jsPDF
   */
  jsPDFAPI.addImage = function(imageData, format, x, y, w, h, alias, compression, rotation) {
    'use strict'

    var tmpImageData = '';

    if(typeof format !== 'string') {
      var tmp = h;
      h = w;
      w = y;
      y = x;
      x = format;
      format = tmp;
    }

    if (typeof imageData === 'object' && !isDOMElement(imageData) && "imageData" in imageData) {
      var options = imageData;

      imageData = options.imageData;
      format = options.format || format || 'UNKNOWN';
      x = options.x || x || 0;
      y = options.y || y || 0;
      w = options.w || w;
      h = options.h || h;
      alias = options.alias || alias;
      compression = options.compression || compression;
      rotation = options.rotation || options.angle || rotation;
    }

    //If compression is not explicitly set, determine if we should use compression
    var filters = this.internal.getFilters();
    if (compression === undefined && filters.indexOf('FlateEncode') !== -1) {
      compression = 'SLOW';
    }

    if (typeof imageData === "string") {
      imageData = unescape(imageData);
    }
    if (isNaN(x) || isNaN(y))
    {
      console.error('jsPDF.addImage: Invalid coordinates', arguments);
      throw new Error('Invalid coordinates passed to jsPDF.addImage');
    }

    var images = getImages.call(this), info, dataAsBinaryString;

    if (!(info = checkImagesForAlias(imageData, images))) {
      if(isDOMElement(imageData))
        imageData = createDataURIFromElement(imageData, format);

      if(notDefined(alias))
        alias = generateAliasFromImageData(imageData);

      if (!(info = checkImagesForAlias(alias, images))) {
        if(typeof imageData === 'string') {
          tmpImageData = this.convertStringToImageData(imageData, false);

          if (tmpImageData !== '') {
            imageData = tmpImageData;
          } else {
            tmpImageData = jsPDFAPI.loadFile(imageData);
            if (tmpImageData !== undefined) {
              imageData = tmpImageData;
            }
          }
        }
        format = this.getImageFileTypeByImageData(imageData, format);

        if(!isImageTypeSupported(format))
          throw new Error('addImage does not support files of type \''+format+'\', please ensure that a plugin for \''+format+'\' support is added.');

        /**
         * need to test if it's more efficient to convert all binary strings
         * to TypedArray - or should we just leave and process as string?
         */
        if(this.supportsArrayBuffer()) {
          // no need to convert if imageData is already uint8array
          if(!(imageData instanceof Uint8Array)){
            dataAsBinaryString = imageData;
            imageData = this.binaryStringToUint8Array(imageData);
          }
        }

        info = this['process' + format.toUpperCase()](
            imageData,
            getImageIndex(images),
            alias,
            checkCompressValue(compression),
            dataAsBinaryString
        );

        if(!info) {
          throw new Error('An unknown error occurred whilst processing the image');
        }
      }
    }
    writeImageToPDF.call(this, x, y, w, h, info, info.i, images, rotation);

    return this;
  };

  /**
   * @name convertStringToImageData
   * @function
   * @param {string} stringData
   * @returns {string} binary data
   */
  jsPDFAPI.convertStringToImageData = function (stringData, throwError) {
    throwError = typeof throwError === "boolean" ? throwError : true;
    var base64Info;
    var imageData = '';
    var rawData;

    if(typeof stringData === 'string') {
      var base64Info = this.extractImageFromDataUrl(stringData);
      rawData = (base64Info !== null) ? base64Info.data : stringData;

      try {
        imageData = atob(rawData);
      } catch (e) {
        if (!jsPDFAPI.validateStringAsBase64(rawData)) {
          if (throwError) {
            throw new Error('Supplied Data is not a valid base64-String jsPDF.convertStringToImageData ');
          } else {
            console.log('Supplied Data is not a valid base64-String jsPDF.convertStringToImageData ')
          }
        } else {
          if (throwError) {
            throw new Error('atob-Error in jsPDF.convertStringToImageData ' + e.message);
          } else {
            console.log('atob-Error in jsPDF.convertStringToImageData ' + e.message)
          }
        }
      }
    }
    return imageData;
  }
  /**
   * JPEG SUPPORT
   **/

      //takes a string imgData containing the raw bytes of
      //a jpeg image and returns [width, height]
      //Algorithm from: http://www.64lines.com/jpeg-width-height
  var getJpegSize = function(imgData) {
        'use strict'
        var width, height, numcomponents;
        // Verify we have a valid jpeg header 0xff,0xd8,0xff,0xe0,?,?,'J','F','I','F',0x00
        if (getImageFileTypeByImageData(imgData) !== 'JPEG') {
          throw new Error('getJpegSize requires a binary string jpeg file')
        }
        var blockLength = imgData.charCodeAt(4)*256 + imgData.charCodeAt(5);
        var i = 4, len = imgData.length;
        while ( i < len ) {
          i += blockLength;
          if (imgData.charCodeAt(i) !== 0xff) {
            throw new Error('getJpegSize could not find the size of the image');
          }
          if (imgData.charCodeAt(i+1) === 0xc0 || //(SOF) Huffman  - Baseline DCT
              imgData.charCodeAt(i+1) === 0xc1 || //(SOF) Huffman  - Extended sequential DCT
              imgData.charCodeAt(i+1) === 0xc2 || // Progressive DCT (SOF2)
              imgData.charCodeAt(i+1) === 0xc3 || // Spatial (sequential) lossless (SOF3)
              imgData.charCodeAt(i+1) === 0xc4 || // Differential sequential DCT (SOF5)
              imgData.charCodeAt(i+1) === 0xc5 || // Differential progressive DCT (SOF6)
              imgData.charCodeAt(i+1) === 0xc6 || // Differential spatial (SOF7)
              imgData.charCodeAt(i+1) === 0xc7) {
            height = imgData.charCodeAt(i+5)*256 + imgData.charCodeAt(i+6);
            width = imgData.charCodeAt(i+7)*256 + imgData.charCodeAt(i+8);
            numcomponents = imgData.charCodeAt(i+9);
            return [width, height, numcomponents];
          } else {
            i += 2;
            blockLength = imgData.charCodeAt(i)*256 + imgData.charCodeAt(i+1)
          }
        }
      }
      , getJpegSizeFromBytes = function(data) {

        var hdr = (data[0] << 8) | data[1];

        if(hdr !== 0xFFD8)
          throw new Error('Supplied data is not a JPEG');

        var len = data.length,
            block = (data[4] << 8) + data[5],
            pos = 4,
            bytes, width, height, numcomponents;

        while(pos < len) {
          pos += block;
          bytes = readBytes(data, pos);
          block = (bytes[2] << 8) + bytes[3];
          if((bytes[1] === 0xC0 || bytes[1] === 0xC2) && bytes[0] === 0xFF && block > 7) {
            bytes = readBytes(data, pos + 5);
            width = (bytes[2] << 8) + bytes[3];
            height = (bytes[0] << 8) + bytes[1];
            numcomponents = bytes[4];
            return {width:width, height:height, numcomponents: numcomponents};
          }

          pos+=2;
        }

        throw new Error('getJpegSizeFromBytes could not find the size of the image');
      }
      , readBytes = function(data, offset) {
        return data.subarray(offset, offset+ 5);
      };

  /**
   * @ignore
   */
  jsPDFAPI.processJPEG = function(data, index, alias, compression, dataAsBinaryString, colorSpace) {
    'use strict'
    var filter = this.decode.DCT_DECODE,
        bpc = 8,
        dims;

    if (!(typeof data === 'string') && !this.isArrayBuffer(data) && !this.isArrayBufferView(data)) {
      return null;
    }

    if(typeof data === 'string') {
      dims = getJpegSize(data);
    }

    if(this.isArrayBuffer(data)) {
      data = new Uint8Array(data);
    }
    if(this.isArrayBufferView(data)) {

      dims = getJpegSizeFromBytes(data);

      // if we already have a stored binary string rep use that
      data = dataAsBinaryString || this.arrayBufferToBinaryString(data);

    }

    if (colorSpace === undefined) {
      switch (dims.numcomponents) {
        case 1:
          colorSpace = this.color_spaces.DEVICE_GRAY;
          break;
        case 4:
          colorSpace = this.color_spaces.DEVICE_CMYK;
          break;
        default:
        case 3:
          colorSpace = this.color_spaces.DEVICE_RGB;
          break;
      }
    }

    return this.createImageInfo(data, dims.width, dims.height, colorSpace, bpc, filter, index, alias);
  };

  /**
   * @ignore
   */
  jsPDFAPI.processJPG = function(/*data, index, alias, compression, dataAsBinaryString*/) {
    return this.processJPEG.apply(this, arguments);
  };

  /**
   * @name getImageProperties
   * @function
   * @param {Object} imageData
   * @returns {Object}
   */
  jsPDFAPI.getImageProperties = function (imageData) {
    var info;
    var tmpImageData = '';
    var format;
    var dataAsBinaryString;

    if(isDOMElement(imageData)) {
      imageData = createDataURIFromElement(imageData);
    }

    if(typeof imageData === "string") {
      tmpImageData = this.convertStringToImageData(imageData, false);

      if (tmpImageData === '') {
        tmpImageData = jsPDFAPI.loadFile(imageData) || '';
      }
      imageData = tmpImageData;
    }
    format = this.getImageFileTypeByImageData(imageData);

    if(!isImageTypeSupported(format)) {
      throw new Error('addImage does not support files of type \''+format+'\', please ensure that a plugin for \''+format+'\' support is added.');
    }
    /**
     * need to test if it's more efficient to convert all binary strings
     * to TypedArray - or should we just leave and process as string?
     */
    if(this.supportsArrayBuffer()) {
      // no need to convert if imageData is already uint8array
      if(!(imageData instanceof Uint8Array)){
        dataAsBinaryString = imageData;
        imageData = this.binaryStringToUint8Array(imageData);
      }
    }

    info = this['process' + format.toUpperCase()](
        imageData
    );

    if(!info){
      throw new Error('An unknown error occurred whilst processing the image');
    }

    return {
      fileType : format,
      width: info.w,
      height: info.h,
      colorSpace: info.cs,
      compressionMode: info.f,
      bitsPerComponent: info.bpc
    };
  };

})(jsPDF.API);

/**
 * @license
 *
 * Copyright (c) 2014 James Robb, https://github.com/jamesbrobb
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 * ====================================================================
 */

/**
 * jsPDF PNG PlugIn
 * @name png_support
 * @module
 */
(function(jsPDFAPI) {
  'use strict'

  /*
   * @see http://www.w3.org/TR/PNG-Chunks.html
   *
   Color    Allowed      Interpretation
   Type     Bit Depths

     0       1,2,4,8,16  Each pixel is a grayscale sample.

     2       8,16        Each pixel is an R,G,B triple.

     3       1,2,4,8     Each pixel is a palette index;
                         a PLTE chunk must appear.

     4       8,16        Each pixel is a grayscale sample,
                         followed by an alpha sample.

     6       8,16        Each pixel is an R,G,B triple,
                         followed by an alpha sample.
  */

  /*
   * PNG filter method types
   *
   * @see http://www.w3.org/TR/PNG-Filters.html
   * @see http://www.libpng.org/pub/png/book/chapter09.html
   *
   * This is what the value 'Predictor' in decode params relates to
   *
   * 15 is "optimal prediction", which means the prediction algorithm can change from line to line.
   * In that case, you actually have to read the first byte off each line for the prediction algorthim (which should be 0-4, corresponding to PDF 10-14) and select the appropriate unprediction algorithm based on that byte.
   *
     0       None
     1       Sub
     2       Up
     3       Average
     4       Paeth
   */

  var doesNotHavePngJS = function() {
    return typeof PNG !== 'function' || typeof FlateStream !== 'function';
  }
      , canCompress = function(value) {
    return value !== jsPDFAPI.image_compression.NONE && hasCompressionJS();
  }
      , hasCompressionJS = function() {
    var inst = typeof Deflater === 'function';
    if(!inst)
      throw new Error("requires deflate.js for compression")
    return inst;
  }
      , compressBytes = function(bytes, lineLength, colorsPerPixel, compression) {

    var level = 5,
        filter_method = filterUp;

    switch(compression) {

      case jsPDFAPI.image_compression.FAST:

        level = 3;
        filter_method = filterSub;
        break;

      case jsPDFAPI.image_compression.MEDIUM:

        level = 6;
        filter_method = filterAverage;
        break;

      case jsPDFAPI.image_compression.SLOW:

        level = 9;
        filter_method = filterPaeth;//uses to sum to choose best filter for each line
        break;
    }

    bytes = applyPngFilterMethod(bytes, lineLength, colorsPerPixel, filter_method);

    var header = new Uint8Array(createZlibHeader(level));
    var checksum = adler32(bytes);

    var deflate = new Deflater(level);
    var a = deflate.append(bytes);
    var cBytes = deflate.flush();

    var len = header.length + a.length + cBytes.length;

    var cmpd = new Uint8Array(len + 4);
    cmpd.set(header);
    cmpd.set(a, header.length);
    cmpd.set(cBytes, header.length + a.length);

    cmpd[len++] = (checksum >>> 24) & 0xff;
    cmpd[len++] = (checksum >>> 16) & 0xff;
    cmpd[len++] = (checksum >>> 8) & 0xff;
    cmpd[len++] = checksum & 0xff;

    return jsPDFAPI.arrayBufferToBinaryString(cmpd);
  }
      , createZlibHeader = function(bytes, level){
    /*
     * @see http://www.ietf.org/rfc/rfc1950.txt for zlib header
     */
    var cm = 8;
    var cinfo = Math.LOG2E * Math.log(0x8000) - 8;
    var cmf = (cinfo << 4) | cm;

    var hdr = cmf << 8;
    var flevel = Math.min(3, ((level - 1) & 0xff) >> 1);

    hdr |= (flevel << 6);
    hdr |= 0;//FDICT
    hdr += 31 - (hdr % 31);

    return [cmf, (hdr & 0xff) & 0xff];
  }
      , adler32 = function(array, param) {
    var adler = 1;
    var s1 = adler & 0xffff,
        s2 = (adler >>> 16) & 0xffff;
    var len = array.length;
    var tlen;
    var i = 0;

    while (len > 0) {
      tlen = len > param ? param : len;
      len -= tlen;
      do {
        s1 += array[i++];
        s2 += s1;
      } while (--tlen);

      s1 %= 65521;
      s2 %= 65521;
    }

    return ((s2 << 16) | s1) >>> 0;
  }
      , applyPngFilterMethod = function(bytes, lineLength, colorsPerPixel, filter_method) {
    var lines = bytes.length / lineLength,
        result = new Uint8Array(bytes.length + lines),
        filter_methods = getFilterMethods(),
        i = 0, line, prevLine, offset;

    for(; i < lines; i++) {
      offset = i * lineLength;
      line = bytes.subarray(offset, offset + lineLength);

      if(filter_method) {
        result.set(filter_method(line, colorsPerPixel, prevLine), offset + i);

      }else{

        var j = 0,
            len = filter_methods.length,
            results = [];

        for(; j < len; j++)
          results[j] = filter_methods[j](line, colorsPerPixel, prevLine);

        var ind = getIndexOfSmallestSum(results.concat());

        result.set(results[ind], offset + i);
      }

      prevLine = line;
    }

    return result;
  }
      , filterNone = function(line, colorsPerPixel, prevLine) {
    /*var result = new Uint8Array(line.length + 1);
    result[0] = 0;
    result.set(line, 1);*/

    var result = Array.apply([], line);
    result.unshift(0);

    return result;
  }
      , filterSub = function(line, colorsPerPixel, prevLine) {
    var result = [],
        i = 0,
        len = line.length,
        left;

    result[0] = 1;

    for(; i < len; i++) {
      left = line[i - colorsPerPixel] || 0;
      result[i + 1] = (line[i] - left + 0x0100) & 0xff;
    }

    return result;
  }
      , filterUp = function(line, colorsPerPixel, prevLine) {
    var result = [],
        i = 0,
        len = line.length,
        up;

    result[0] = 2;

    for(; i < len; i++) {
      up = prevLine && prevLine[i] || 0;
      result[i + 1] = (line[i] - up + 0x0100) & 0xff;
    }

    return result;
  }
      , filterAverage = function(line, colorsPerPixel, prevLine) {
    var result = [],
        i = 0,
        len = line.length,
        left,
        up;

    result[0] = 3;

    for(; i < len; i++) {
      left = line[i - colorsPerPixel] || 0;
      up = prevLine && prevLine[i] || 0;
      result[i + 1] = (line[i] + 0x0100 - ((left + up) >>> 1)) & 0xff;
    }

    return result;
  }
      , filterPaeth = function(line, colorsPerPixel, prevLine) {
    var result = [],
        i = 0,
        len = line.length,
        left,
        up,
        upLeft,
        paeth;

    result[0] = 4;

    for(; i < len; i++) {
      left = line[i - colorsPerPixel] || 0;
      up = prevLine && prevLine[i] || 0;
      upLeft = prevLine && prevLine[i - colorsPerPixel] || 0;
      paeth = paethPredictor(left, up, upLeft);
      result[i + 1] = (line[i] - paeth + 0x0100) & 0xff;
    }

    return result;
  }
      ,paethPredictor = function(left, up, upLeft) {

    var p = left + up - upLeft,
        pLeft = Math.abs(p - left),
        pUp = Math.abs(p - up),
        pUpLeft = Math.abs(p - upLeft);

    return (pLeft <= pUp && pLeft <= pUpLeft) ? left : (pUp <= pUpLeft) ? up : upLeft;
  }
      , getFilterMethods = function() {
    return [filterNone, filterSub, filterUp, filterAverage, filterPaeth];
  }
      ,getIndexOfSmallestSum = function(arrays) {
    var i = 0,
        len = arrays.length,
        sum, min, ind;

    while(i < len) {
      sum = absSum(arrays[i].slice(1));

      if(sum < min || !min) {
        min = sum;
        ind = i;
      }

      i++;
    }

    return ind;
  }
      , absSum = function(array) {
    var i = 0,
        len = array.length,
        sum = 0;

    while(i < len)
      sum += Math.abs(array[i++]);

    return sum;
  }
      , getPredictorFromCompression = function (compression) {
    var predictor;
    switch (compression) {
      case jsPDFAPI.image_compression.FAST:
        predictor = 11;
        break;

      case jsPDFAPI.image_compression.MEDIUM:
        predictor = 13;
        break;

      case jsPDFAPI.image_compression.SLOW:
        predictor = 14;
        break;

      default:
        predictor = 12;
        break;
    }
    return predictor;
  }
      , logImg = function(img) {
    console.log("width: " + img.width);
    console.log("height: " + img.height);
    console.log("bits: " + img.bits);
    console.log("colorType: " + img.colorType);
    console.log("transparency:");
    console.log(img.transparency);
    console.log("text:");
    console.log(img.text);
    console.log("compressionMethod: " + img.compressionMethod);
    console.log("filterMethod: " + img.filterMethod);
    console.log("interlaceMethod: " + img.interlaceMethod);
    console.log("imgData:");
    console.log(img.imgData);
    console.log("palette:");
    console.log(img.palette);
    console.log("colors: " + img.colors);
    console.log("colorSpace: " + img.colorSpace);
    console.log("pixelBitlength: " + img.pixelBitlength);
    console.log("hasAlphaChannel: " + img.hasAlphaChannel);
  };
  /**
   *
   * @name processPNG
   * @function
   * @ignore
   */
  jsPDFAPI.processPNG = function(imageData, imageIndex, alias, compression, dataAsBinaryString) {
    'use strict'

    var colorSpace = this.color_spaces.DEVICE_RGB,
        decode = this.decode.FLATE_DECODE,
        bpc = 8,
        img, dp, trns,
        colors, pal, smask;

    /*	if(this.isString(imageData)) {

        }*/

    if(this.isArrayBuffer(imageData))
      imageData = new Uint8Array(imageData);

    if(this.isArrayBufferView(imageData)) {

      if(doesNotHavePngJS())
        throw new Error("PNG support requires png.js and zlib.js");

      img = new PNG(imageData);
      imageData = img.imgData;
      bpc = img.bits;
      colorSpace = img.colorSpace;
      colors = img.colors;

      //logImg(img);

      /*
       * colorType 6 - Each pixel is an R,G,B triple, followed by an alpha sample.
       *
       * colorType 4 - Each pixel is a grayscale sample, followed by an alpha sample.
       *
       * Extract alpha to create two separate images, using the alpha as a sMask
       */
      if([4,6].indexOf(img.colorType) !== -1) {

        /*
         * processes 8 bit RGBA and grayscale + alpha images
         */
        if(img.bits === 8) {

          var pixels = img.pixelBitlength == 32 ? new Uint32Array(img.decodePixels().buffer) : img.pixelBitlength == 16 ? new Uint16Array(img.decodePixels().buffer) : new Uint8Array(img.decodePixels().buffer),
              len = pixels.length,
              imgData = new Uint8Array(len * img.colors),
              alphaData = new Uint8Array(len),
              pDiff = img.pixelBitlength - img.bits,
              i = 0, n = 0, pixel, pbl;

          for(; i < len; i++) {
            pixel = pixels[i];
            pbl = 0;

            while(pbl < pDiff) {

              imgData[n++] = ( pixel >>> pbl ) & 0xff;
              pbl = pbl + img.bits;
            }

            alphaData[i] = ( pixel >>> pbl ) & 0xff;
          }
        }

        /*
         * processes 16 bit RGBA and grayscale + alpha images
         */
        if(img.bits === 16) {

          var pixels = new Uint32Array(img.decodePixels().buffer),
              len = pixels.length,
              imgData = new Uint8Array((len * (32 / img.pixelBitlength) ) * img.colors),
              alphaData = new Uint8Array(len * (32 / img.pixelBitlength) ),
              hasColors = img.colors > 1,
              i = 0, n = 0, a = 0, pixel;

          while(i < len) {
            pixel = pixels[i++];

            imgData[n++] = (pixel >>> 0) & 0xFF;

            if(hasColors) {
              imgData[n++] = (pixel >>> 16) & 0xFF;

              pixel = pixels[i++];
              imgData[n++] = (pixel >>> 0) & 0xFF;
            }

            alphaData[a++] = (pixel >>> 16) & 0xFF;
          }

          bpc = 8;
        }

        if(canCompress(compression)) {

          imageData = compressBytes(imgData, img.width * img.colors, img.colors, compression);
          smask = compressBytes(alphaData, img.width, 1, compression);

        }else{

          imageData = imgData;
          smask = alphaData;
          decode = null;
        }
      }

      /*
       * Indexed png. Each pixel is a palette index.
       */
      if(img.colorType === 3) {

        colorSpace = this.color_spaces.INDEXED;
        pal = img.palette;

        if(img.transparency.indexed) {

          var trans = img.transparency.indexed;

          var total = 0,
              i = 0,
              len = trans.length;

          for(; i<len; ++i)
            total += trans[i];

          total = total / 255;

          /*
           * a single color is specified as 100% transparent (0),
           * so we set trns to use a /Mask with that index
           */
          if(total === len - 1 && trans.indexOf(0) !== -1) {
            trns = [trans.indexOf(0)];

            /*
             * there's more than one colour within the palette that specifies
             * a transparency value less than 255, so we unroll the pixels to create an image sMask
             */
          }else if(total !== len){

            var pixels = img.decodePixels(),
                alphaData = new Uint8Array(pixels.length),
                i = 0,
                len = pixels.length;

            for(; i < len; i++)
              alphaData[i] = trans[pixels[i]];

            smask = compressBytes(alphaData, img.width, 1);
          }
        }
      }

      var predictor = getPredictorFromCompression(compression);

      if(decode === this.decode.FLATE_DECODE)
        dp = '/Predictor '+ predictor +' /Colors '+ colors +' /BitsPerComponent '+ bpc +' /Columns '+ img.width;
      else
      //remove 'Predictor' as it applies to the type of png filter applied to its IDAT - we only apply with compression
        dp = '/Colors '+ colors +' /BitsPerComponent '+ bpc +' /Columns '+ img.width;

      if(this.isArrayBuffer(imageData) || this.isArrayBufferView(imageData))
        imageData = this.arrayBufferToBinaryString(imageData);

      if(smask && this.isArrayBuffer(smask) || this.isArrayBufferView(smask))
        smask = this.arrayBufferToBinaryString(smask);

      return this.createImageInfo(imageData, img.width, img.height, colorSpace,
          bpc, decode, imageIndex, alias, dp, trns, pal, smask, predictor);
    }

    throw new Error("Unsupported PNG image data, try using JPEG instead.");
  }

})(jsPDF.API);

// Generated by CoffeeScript 1.4.0

/*
# PNG.js
# Copyright (c) 2011 Devon Govett
# MIT LICENSE
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of this
# software and associated documentation files (the "Software"), to deal in the Software
# without restriction, including without limitation the rights to use, copy, modify, merge,
# publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
# to whom the Software is furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all copies or
# substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
# BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
# NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
# DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


(function(global) {
  var PNG;

  PNG = (function() {
    var APNG_BLEND_OP_OVER, APNG_BLEND_OP_SOURCE, APNG_DISPOSE_OP_BACKGROUND, APNG_DISPOSE_OP_NONE, APNG_DISPOSE_OP_PREVIOUS, makeImage, scratchCanvas, scratchCtx;

    PNG.load = function(url, canvas, callback) {
      var xhr,
          _this = this;
      if (typeof canvas === 'function') {
        callback = canvas;
      }
      xhr = new XMLHttpRequest;
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      xhr.onload = function() {
        var data, png;
        data = new Uint8Array(xhr.response || xhr.mozResponseArrayBuffer);
        png = new PNG(data);
        if (typeof (canvas != null ? canvas.getContext : void 0) === 'function') {
          png.render(canvas);
        }
        return typeof callback === "function" ? callback(png) : void 0;
      };
      return xhr.send(null);
    };

    APNG_DISPOSE_OP_NONE = 0;

    APNG_DISPOSE_OP_BACKGROUND = 1;

    APNG_DISPOSE_OP_PREVIOUS = 2;

    APNG_BLEND_OP_SOURCE = 0;

    APNG_BLEND_OP_OVER = 1;

    function PNG(data) {
      var chunkSize, colors, palLen, delayDen, delayNum, frame, i, index, key, section, palShort, text, _i, _j, _ref;
      this.data = data;
      this.pos = 8;
      this.palette = [];
      this.imgData = [];
      this.transparency = {};
      this.animation = null;
      this.text = {};
      frame = null;
      while (true) {
        chunkSize = this.readUInt32();
        section = ((function() {
          var _i, _results;
          _results = [];
          for (i = _i = 0; _i < 4; i = ++_i) {
            _results.push(String.fromCharCode(this.data[this.pos++]));
          }
          return _results;
        }).call(this)).join('');
        switch (section) {
          case 'IHDR':
            this.width = this.readUInt32();
            this.height = this.readUInt32();
            this.bits = this.data[this.pos++];
            this.colorType = this.data[this.pos++];
            this.compressionMethod = this.data[this.pos++];
            this.filterMethod = this.data[this.pos++];
            this.interlaceMethod = this.data[this.pos++];
            break;
          case 'acTL':
            this.animation = {
              numFrames: this.readUInt32(),
              numPlays: this.readUInt32() || Infinity,
              frames: []
            };
            break;
          case 'PLTE':
            this.palette = this.read(chunkSize);
            break;
          case 'fcTL':
            if (frame) {
              this.animation.frames.push(frame);
            }
            this.pos += 4;
            frame = {
              width: this.readUInt32(),
              height: this.readUInt32(),
              xOffset: this.readUInt32(),
              yOffset: this.readUInt32()
            };
            delayNum = this.readUInt16();
            delayDen = this.readUInt16() || 100;
            frame.delay = 1000 * delayNum / delayDen;
            frame.disposeOp = this.data[this.pos++];
            frame.blendOp = this.data[this.pos++];
            frame.data = [];
            break;
          case 'IDAT':
          case 'fdAT':
            if (section === 'fdAT') {
              this.pos += 4;
              chunkSize -= 4;
            }
            data = (frame != null ? frame.data : void 0) || this.imgData;
            for (i = _i = 0; 0 <= chunkSize ? _i < chunkSize : _i > chunkSize; i = 0 <= chunkSize ? ++_i : --_i) {
              data.push(this.data[this.pos++]);
            }
            break;
          case 'tRNS':
            this.transparency = {};
            switch (this.colorType) {
              case 3:
                palLen = this.palette.length/3;
                this.transparency.indexed = this.read(chunkSize);
                if(this.transparency.indexed.length > palLen)
                  throw new Error('More transparent colors than palette size');
                /*
                 * According to the PNG spec trns should be increased to the same size as palette if shorter
                 */
                //palShort = 255 - this.transparency.indexed.length;
                palShort = palLen - this.transparency.indexed.length;
                if (palShort > 0) {
                  for (i = _j = 0; 0 <= palShort ? _j < palShort : _j > palShort; i = 0 <= palShort ? ++_j : --_j) {
                    this.transparency.indexed.push(255);
                  }
                }
                break;
              case 0:
                this.transparency.grayscale = this.read(chunkSize)[0];
                break;
              case 2:
                this.transparency.rgb = this.read(chunkSize);
            }
            break;
          case 'tEXt':
            text = this.read(chunkSize);
            index = text.indexOf(0);
            key = String.fromCharCode.apply(String, text.slice(0, index));
            this.text[key] = String.fromCharCode.apply(String, text.slice(index + 1));
            break;
          case 'IEND':
            if (frame) {
              this.animation.frames.push(frame);
            }
            this.colors = (function() {
              switch (this.colorType) {
                case 0:
                case 3:
                case 4:
                  return 1;
                case 2:
                case 6:
                  return 3;
              }
            }).call(this);
            this.hasAlphaChannel = (_ref = this.colorType) === 4 || _ref === 6;
            colors = this.colors + (this.hasAlphaChannel ? 1 : 0);
            this.pixelBitlength = this.bits * colors;
            this.colorSpace = (function() {
              switch (this.colors) {
                case 1:
                  return 'DeviceGray';
                case 3:
                  return 'DeviceRGB';
              }
            }).call(this);
            this.imgData = new Uint8Array(this.imgData);
            return;
          default:
            this.pos += chunkSize;
        }
        this.pos += 4;
        if (this.pos > this.data.length) {
          throw new Error("Incomplete or corrupt PNG file");
        }
      }
      return;
    }

    PNG.prototype.read = function(bytes) {
      var i, _i, _results;
      _results = [];
      for (i = _i = 0; 0 <= bytes ? _i < bytes : _i > bytes; i = 0 <= bytes ? ++_i : --_i) {
        _results.push(this.data[this.pos++]);
      }
      return _results;
    };

    PNG.prototype.readUInt32 = function() {
      var b1, b2, b3, b4;
      b1 = this.data[this.pos++] << 24;
      b2 = this.data[this.pos++] << 16;
      b3 = this.data[this.pos++] << 8;
      b4 = this.data[this.pos++];
      return b1 | b2 | b3 | b4;
    };

    PNG.prototype.readUInt16 = function() {
      var b1, b2;
      b1 = this.data[this.pos++] << 8;
      b2 = this.data[this.pos++];
      return b1 | b2;
    };


    PNG.prototype.decodePixels = function(data) {
      var pixelBytes = this.pixelBitlength / 8;
      var fullPixels = new Uint8Array(this.width * this.height * pixelBytes);
      var pos = 0;
      var _this = this;

      if (data == null) {
        data = this.imgData;
      }
      if (data.length === 0) {
        return new Uint8Array(0);
      }

      data = new FlateStream(data);
      data = data.getBytes();
      function pass (x0, y0, dx, dy) {
        var abyte, c, col, i, left, length, p, pa, paeth, pb, pc, pixels, row, scanlineLength, upper, upperLeft, _i, _j, _k, _l, _m;
        var w = Math.ceil((_this.width - x0) / dx), h = Math.ceil((_this.height - y0) / dy);
        var isFull = _this.width == w && _this.height == h;
        scanlineLength = pixelBytes * w;
        pixels = isFull ? fullPixels : new Uint8Array(scanlineLength * h);
        length = data.length;
        row = 0;
        c = 0;
        while (row < h && pos < length) {
          switch (data[pos++]) {
            case 0:
              for (i = _i = 0; _i < scanlineLength; i = _i += 1) {
                pixels[c++] = data[pos++];
              }
              break;
            case 1:
              for (i = _j = 0; _j < scanlineLength; i = _j += 1) {
                abyte = data[pos++];
                left = i < pixelBytes ? 0 : pixels[c - pixelBytes];
                pixels[c++] = (abyte + left) % 256;
              }
              break;
            case 2:
              for (i = _k = 0; _k < scanlineLength; i = _k += 1) {
                abyte = data[pos++];
                col = (i - (i % pixelBytes)) / pixelBytes;
                upper = row && pixels[(row - 1) * scanlineLength + col * pixelBytes + (i % pixelBytes)];
                pixels[c++] = (upper + abyte) % 256;
              }
              break;
            case 3:
              for (i = _l = 0; _l < scanlineLength; i = _l += 1) {
                abyte = data[pos++];
                col = (i - (i % pixelBytes)) / pixelBytes;
                left = i < pixelBytes ? 0 : pixels[c - pixelBytes];
                upper = row && pixels[(row - 1) * scanlineLength + col * pixelBytes + (i % pixelBytes)];
                pixels[c++] = (abyte + Math.floor((left + upper) / 2)) % 256;
              }
              break;
            case 4:
              for (i = _m = 0; _m < scanlineLength; i = _m += 1) {
                abyte = data[pos++];
                col = (i - (i % pixelBytes)) / pixelBytes;
                left = i < pixelBytes ? 0 : pixels[c - pixelBytes];
                if (row === 0) {
                  upper = upperLeft = 0;
                } else {
                  upper = pixels[(row - 1) * scanlineLength + col * pixelBytes + (i % pixelBytes)];
                  upperLeft = col && pixels[(row - 1) * scanlineLength + (col - 1) * pixelBytes + (i % pixelBytes)];
                }
                p = left + upper - upperLeft;
                pa = Math.abs(p - left);
                pb = Math.abs(p - upper);
                pc = Math.abs(p - upperLeft);
                if (pa <= pb && pa <= pc) {
                  paeth = left;
                } else if (pb <= pc) {
                  paeth = upper;
                } else {
                  paeth = upperLeft;
                }
                pixels[c++] = (abyte + paeth) % 256;
              }
              break;
            default:
              throw new Error("Invalid filter algorithm: " + data[pos - 1]);
          }
          if (!isFull) {
            var fullPos = ((y0 + row * dy) * _this.width + x0) * pixelBytes;
            var partPos = row * scanlineLength;
            for (i = 0; i < w; i += 1) {
              for (var j = 0; j < pixelBytes; j += 1)
                fullPixels[fullPos++] = pixels[partPos++];
              fullPos += (dx - 1) * pixelBytes;
            }
          }
          row++;
        }
      }
      if (_this.interlaceMethod == 1) {
        /*
          1 6 4 6 2 6 4 6
          7 7 7 7 7 7 7 7
          5 6 5 6 5 6 5 6
          7 7 7 7 7 7 7 7
          3 6 4 6 3 6 4 6
          7 7 7 7 7 7 7 7
          5 6 5 6 5 6 5 6
          7 7 7 7 7 7 7 7
        */
        pass(0, 0, 8, 8); // 1
        /* NOTE these seem to follow the pattern:
         * pass(x, 0, 2*x, 2*x);
         * pass(0, x,   x, 2*x);
         * with x being 4, 2, 1.
         */
        pass(4, 0, 8, 8); // 2
        pass(0, 4, 4, 8); // 3

        pass(2, 0, 4, 4); // 4
        pass(0, 2, 2, 4); // 5

        pass(1, 0, 2, 2); // 6
        pass(0, 1, 1, 2); // 7
      } else {
        pass(0, 0, 1, 1);
      }
      return fullPixels;
    };

    PNG.prototype.decodePalette = function() {
      var c, i, length, palette, pos, ret, transparency, _i, _ref, _ref1;
      palette = this.palette;
      transparency = this.transparency.indexed || [];
      ret = new Uint8Array((transparency.length || 0) + palette.length);
      pos = 0;
      length = palette.length;
      c = 0;
      for (i = _i = 0, _ref = palette.length; _i < _ref; i = _i += 3) {
        ret[pos++] = palette[i];
        ret[pos++] = palette[i + 1];
        ret[pos++] = palette[i + 2];
        ret[pos++] = (_ref1 = transparency[c++]) != null ? _ref1 : 255;
      }
      return ret;
    };

    PNG.prototype.copyToImageData = function(imageData, pixels) {
      var alpha, colors, data, i, input, j, k, length, palette, v, _ref;
      colors = this.colors;
      palette = null;
      alpha = this.hasAlphaChannel;
      if (this.palette.length) {
        palette = (_ref = this._decodedPalette) != null ? _ref : this._decodedPalette = this.decodePalette();
        colors = 4;
        alpha = true;
      }
      data = imageData.data || imageData;
      length = data.length;
      input = palette || pixels;
      i = j = 0;
      if (colors === 1) {
        while (i < length) {
          k = palette ? pixels[i / 4] * 4 : j;
          v = input[k++];
          data[i++] = v;
          data[i++] = v;
          data[i++] = v;
          data[i++] = alpha ? input[k++] : 255;
          j = k;
        }
      } else {
        while (i < length) {
          k = palette ? pixels[i / 4] * 4 : j;
          data[i++] = input[k++];
          data[i++] = input[k++];
          data[i++] = input[k++];
          data[i++] = alpha ? input[k++] : 255;
          j = k;
        }
      }
    };

    PNG.prototype.decode = function() {
      var ret;
      ret = new Uint8Array(this.width * this.height * 4);
      this.copyToImageData(ret, this.decodePixels());
      return ret;
    };

    try {
      scratchCanvas = global.document.createElement('canvas');
      scratchCtx = scratchCanvas.getContext('2d');
    } catch(e) {
      return -1;
    }

    makeImage = function(imageData) {
      var img;
      scratchCtx.width = imageData.width;
      scratchCtx.height = imageData.height;
      scratchCtx.clearRect(0, 0, imageData.width, imageData.height);
      scratchCtx.putImageData(imageData, 0, 0);
      img = new Image;
      img.src = scratchCanvas.toDataURL();
      return img;
    };

    PNG.prototype.decodeFrames = function(ctx) {
      var frame, i, imageData, pixels, _i, _len, _ref, _results;
      if (!this.animation) {
        return;
      }
      _ref = this.animation.frames;
      _results = [];
      for (i = _i = 0, _len = _ref.length; _i < _len; i = ++_i) {
        frame = _ref[i];
        imageData = ctx.createImageData(frame.width, frame.height);
        pixels = this.decodePixels(new Uint8Array(frame.data));
        this.copyToImageData(imageData, pixels);
        frame.imageData = imageData;
        _results.push(frame.image = makeImage(imageData));
      }
      return _results;
    };

    PNG.prototype.renderFrame = function(ctx, number) {
      var frame, frames, prev;
      frames = this.animation.frames;
      frame = frames[number];
      prev = frames[number - 1];
      if (number === 0) {
        ctx.clearRect(0, 0, this.width, this.height);
      }
      if ((prev != null ? prev.disposeOp : void 0) === APNG_DISPOSE_OP_BACKGROUND) {
        ctx.clearRect(prev.xOffset, prev.yOffset, prev.width, prev.height);
      } else if ((prev != null ? prev.disposeOp : void 0) === APNG_DISPOSE_OP_PREVIOUS) {
        ctx.putImageData(prev.imageData, prev.xOffset, prev.yOffset);
      }
      if (frame.blendOp === APNG_BLEND_OP_SOURCE) {
        ctx.clearRect(frame.xOffset, frame.yOffset, frame.width, frame.height);
      }
      return ctx.drawImage(frame.image, frame.xOffset, frame.yOffset);
    };

    PNG.prototype.animate = function(ctx) {
      var doFrame, frameNumber, frames, numFrames, numPlays, _ref,
          _this = this;
      frameNumber = 0;
      _ref = this.animation, numFrames = _ref.numFrames, frames = _ref.frames, numPlays = _ref.numPlays;
      return (doFrame = function() {
        var f, frame;
        f = frameNumber++ % numFrames;
        frame = frames[f];
        _this.renderFrame(ctx, f);
        if (numFrames > 1 && frameNumber / numFrames < numPlays) {
          return _this.animation._timeout = setTimeout(doFrame, frame.delay);
        }
      })();
    };

    PNG.prototype.stopAnimation = function() {
      var _ref;
      return clearTimeout((_ref = this.animation) != null ? _ref._timeout : void 0);
    };

    PNG.prototype.render = function(canvas) {
      var ctx, data;
      if (canvas._png) {
        canvas._png.stopAnimation();
      }
      canvas._png = this;
      canvas.width = this.width;
      canvas.height = this.height;
      ctx = canvas.getContext("2d");
      if (this.animation) {
        this.decodeFrames(ctx);
        return this.animate(ctx);
      } else {
        data = ctx.createImageData(this.width, this.height);
        this.copyToImageData(data, this.decodePixels());
        return ctx.putImageData(data, 0, 0);
      }
    };

    return PNG;

  })();

  global.PNG = PNG;

}(typeof self !== "undefined" && self || typeof window !== "undefined" && window || typeof global !== "undefined" && global ||  Function('return typeof this === "object" && this.content')() || Function('return this')()));
// `self` is undefined in Firefox for Android content script context
// while `this` is nsIContentFrameMessageManager
// with an attribute `content` that corresponds to the window

/*
 * Extracted from pdf.js
 * https://github.com/andreasgal/pdf.js
 *
 * Copyright (c) 2011 Mozilla Foundation
 *
 * Contributors: Andreas Gal <gal@mozilla.com>
 *               Chris G Jones <cjones@mozilla.com>
 *               Shaon Barman <shaon.barman@gmail.com>
 *               Vivien Nicolas <21@vingtetun.org>
 *               Justin D'Arcangelo <justindarc@gmail.com>
 *               Yury Delendik
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

var DecodeStream = (function() {
  function constructor() {
    this.pos = 0;
    this.bufferLength = 0;
    this.eof = false;
    this.buffer = null;
  }

  constructor.prototype = {
    ensureBuffer: function decodestream_ensureBuffer(requested) {
      var buffer = this.buffer;
      var current = buffer ? buffer.byteLength : 0;
      if (requested < current)
        return buffer;
      var size = 512;
      while (size < requested)
        size <<= 1;
      var buffer2 = new Uint8Array(size);
      for (var i = 0; i < current; ++i)
        buffer2[i] = buffer[i];
      return this.buffer = buffer2;
    },
    getByte: function decodestream_getByte() {
      var pos = this.pos;
      while (this.bufferLength <= pos) {
        if (this.eof)
          return null;
        this.readBlock();
      }
      return this.buffer[this.pos++];
    },
    getBytes: function decodestream_getBytes(length) {
      var pos = this.pos;

      if (length) {
        this.ensureBuffer(pos + length);
        var end = pos + length;

        while (!this.eof && this.bufferLength < end)
          this.readBlock();

        var bufEnd = this.bufferLength;
        if (end > bufEnd)
          end = bufEnd;
      } else {
        while (!this.eof)
          this.readBlock();

        var end = this.bufferLength;
      }

      this.pos = end;
      return this.buffer.subarray(pos, end);
    },
    lookChar: function decodestream_lookChar() {
      var pos = this.pos;
      while (this.bufferLength <= pos) {
        if (this.eof)
          return null;
        this.readBlock();
      }
      return String.fromCharCode(this.buffer[this.pos]);
    },
    getChar: function decodestream_getChar() {
      var pos = this.pos;
      while (this.bufferLength <= pos) {
        if (this.eof)
          return null;
        this.readBlock();
      }
      return String.fromCharCode(this.buffer[this.pos++]);
    },
    makeSubStream: function decodestream_makeSubstream(start, length, dict) {
      var end = start + length;
      while (this.bufferLength <= end && !this.eof)
        this.readBlock();
      return new Stream(this.buffer, start, length, dict);
    },
    skip: function decodestream_skip(n) {
      if (!n)
        n = 1;
      this.pos += n;
    },
    reset: function decodestream_reset() {
      this.pos = 0;
    }
  };

  return constructor;
})();

var FlateStream = (function() {
  if (typeof Uint32Array === 'undefined') {
    return undefined;
  }
  var codeLenCodeMap = new Uint32Array([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15
  ]);

  var lengthDecode = new Uint32Array([
    0x00003, 0x00004, 0x00005, 0x00006, 0x00007, 0x00008, 0x00009, 0x0000a,
    0x1000b, 0x1000d, 0x1000f, 0x10011, 0x20013, 0x20017, 0x2001b, 0x2001f,
    0x30023, 0x3002b, 0x30033, 0x3003b, 0x40043, 0x40053, 0x40063, 0x40073,
    0x50083, 0x500a3, 0x500c3, 0x500e3, 0x00102, 0x00102, 0x00102
  ]);

  var distDecode = new Uint32Array([
    0x00001, 0x00002, 0x00003, 0x00004, 0x10005, 0x10007, 0x20009, 0x2000d,
    0x30011, 0x30019, 0x40021, 0x40031, 0x50041, 0x50061, 0x60081, 0x600c1,
    0x70101, 0x70181, 0x80201, 0x80301, 0x90401, 0x90601, 0xa0801, 0xa0c01,
    0xb1001, 0xb1801, 0xc2001, 0xc3001, 0xd4001, 0xd6001
  ]);

  var fixedLitCodeTab = [new Uint32Array([
    0x70100, 0x80050, 0x80010, 0x80118, 0x70110, 0x80070, 0x80030, 0x900c0,
    0x70108, 0x80060, 0x80020, 0x900a0, 0x80000, 0x80080, 0x80040, 0x900e0,
    0x70104, 0x80058, 0x80018, 0x90090, 0x70114, 0x80078, 0x80038, 0x900d0,
    0x7010c, 0x80068, 0x80028, 0x900b0, 0x80008, 0x80088, 0x80048, 0x900f0,
    0x70102, 0x80054, 0x80014, 0x8011c, 0x70112, 0x80074, 0x80034, 0x900c8,
    0x7010a, 0x80064, 0x80024, 0x900a8, 0x80004, 0x80084, 0x80044, 0x900e8,
    0x70106, 0x8005c, 0x8001c, 0x90098, 0x70116, 0x8007c, 0x8003c, 0x900d8,
    0x7010e, 0x8006c, 0x8002c, 0x900b8, 0x8000c, 0x8008c, 0x8004c, 0x900f8,
    0x70101, 0x80052, 0x80012, 0x8011a, 0x70111, 0x80072, 0x80032, 0x900c4,
    0x70109, 0x80062, 0x80022, 0x900a4, 0x80002, 0x80082, 0x80042, 0x900e4,
    0x70105, 0x8005a, 0x8001a, 0x90094, 0x70115, 0x8007a, 0x8003a, 0x900d4,
    0x7010d, 0x8006a, 0x8002a, 0x900b4, 0x8000a, 0x8008a, 0x8004a, 0x900f4,
    0x70103, 0x80056, 0x80016, 0x8011e, 0x70113, 0x80076, 0x80036, 0x900cc,
    0x7010b, 0x80066, 0x80026, 0x900ac, 0x80006, 0x80086, 0x80046, 0x900ec,
    0x70107, 0x8005e, 0x8001e, 0x9009c, 0x70117, 0x8007e, 0x8003e, 0x900dc,
    0x7010f, 0x8006e, 0x8002e, 0x900bc, 0x8000e, 0x8008e, 0x8004e, 0x900fc,
    0x70100, 0x80051, 0x80011, 0x80119, 0x70110, 0x80071, 0x80031, 0x900c2,
    0x70108, 0x80061, 0x80021, 0x900a2, 0x80001, 0x80081, 0x80041, 0x900e2,
    0x70104, 0x80059, 0x80019, 0x90092, 0x70114, 0x80079, 0x80039, 0x900d2,
    0x7010c, 0x80069, 0x80029, 0x900b2, 0x80009, 0x80089, 0x80049, 0x900f2,
    0x70102, 0x80055, 0x80015, 0x8011d, 0x70112, 0x80075, 0x80035, 0x900ca,
    0x7010a, 0x80065, 0x80025, 0x900aa, 0x80005, 0x80085, 0x80045, 0x900ea,
    0x70106, 0x8005d, 0x8001d, 0x9009a, 0x70116, 0x8007d, 0x8003d, 0x900da,
    0x7010e, 0x8006d, 0x8002d, 0x900ba, 0x8000d, 0x8008d, 0x8004d, 0x900fa,
    0x70101, 0x80053, 0x80013, 0x8011b, 0x70111, 0x80073, 0x80033, 0x900c6,
    0x70109, 0x80063, 0x80023, 0x900a6, 0x80003, 0x80083, 0x80043, 0x900e6,
    0x70105, 0x8005b, 0x8001b, 0x90096, 0x70115, 0x8007b, 0x8003b, 0x900d6,
    0x7010d, 0x8006b, 0x8002b, 0x900b6, 0x8000b, 0x8008b, 0x8004b, 0x900f6,
    0x70103, 0x80057, 0x80017, 0x8011f, 0x70113, 0x80077, 0x80037, 0x900ce,
    0x7010b, 0x80067, 0x80027, 0x900ae, 0x80007, 0x80087, 0x80047, 0x900ee,
    0x70107, 0x8005f, 0x8001f, 0x9009e, 0x70117, 0x8007f, 0x8003f, 0x900de,
    0x7010f, 0x8006f, 0x8002f, 0x900be, 0x8000f, 0x8008f, 0x8004f, 0x900fe,
    0x70100, 0x80050, 0x80010, 0x80118, 0x70110, 0x80070, 0x80030, 0x900c1,
    0x70108, 0x80060, 0x80020, 0x900a1, 0x80000, 0x80080, 0x80040, 0x900e1,
    0x70104, 0x80058, 0x80018, 0x90091, 0x70114, 0x80078, 0x80038, 0x900d1,
    0x7010c, 0x80068, 0x80028, 0x900b1, 0x80008, 0x80088, 0x80048, 0x900f1,
    0x70102, 0x80054, 0x80014, 0x8011c, 0x70112, 0x80074, 0x80034, 0x900c9,
    0x7010a, 0x80064, 0x80024, 0x900a9, 0x80004, 0x80084, 0x80044, 0x900e9,
    0x70106, 0x8005c, 0x8001c, 0x90099, 0x70116, 0x8007c, 0x8003c, 0x900d9,
    0x7010e, 0x8006c, 0x8002c, 0x900b9, 0x8000c, 0x8008c, 0x8004c, 0x900f9,
    0x70101, 0x80052, 0x80012, 0x8011a, 0x70111, 0x80072, 0x80032, 0x900c5,
    0x70109, 0x80062, 0x80022, 0x900a5, 0x80002, 0x80082, 0x80042, 0x900e5,
    0x70105, 0x8005a, 0x8001a, 0x90095, 0x70115, 0x8007a, 0x8003a, 0x900d5,
    0x7010d, 0x8006a, 0x8002a, 0x900b5, 0x8000a, 0x8008a, 0x8004a, 0x900f5,
    0x70103, 0x80056, 0x80016, 0x8011e, 0x70113, 0x80076, 0x80036, 0x900cd,
    0x7010b, 0x80066, 0x80026, 0x900ad, 0x80006, 0x80086, 0x80046, 0x900ed,
    0x70107, 0x8005e, 0x8001e, 0x9009d, 0x70117, 0x8007e, 0x8003e, 0x900dd,
    0x7010f, 0x8006e, 0x8002e, 0x900bd, 0x8000e, 0x8008e, 0x8004e, 0x900fd,
    0x70100, 0x80051, 0x80011, 0x80119, 0x70110, 0x80071, 0x80031, 0x900c3,
    0x70108, 0x80061, 0x80021, 0x900a3, 0x80001, 0x80081, 0x80041, 0x900e3,
    0x70104, 0x80059, 0x80019, 0x90093, 0x70114, 0x80079, 0x80039, 0x900d3,
    0x7010c, 0x80069, 0x80029, 0x900b3, 0x80009, 0x80089, 0x80049, 0x900f3,
    0x70102, 0x80055, 0x80015, 0x8011d, 0x70112, 0x80075, 0x80035, 0x900cb,
    0x7010a, 0x80065, 0x80025, 0x900ab, 0x80005, 0x80085, 0x80045, 0x900eb,
    0x70106, 0x8005d, 0x8001d, 0x9009b, 0x70116, 0x8007d, 0x8003d, 0x900db,
    0x7010e, 0x8006d, 0x8002d, 0x900bb, 0x8000d, 0x8008d, 0x8004d, 0x900fb,
    0x70101, 0x80053, 0x80013, 0x8011b, 0x70111, 0x80073, 0x80033, 0x900c7,
    0x70109, 0x80063, 0x80023, 0x900a7, 0x80003, 0x80083, 0x80043, 0x900e7,
    0x70105, 0x8005b, 0x8001b, 0x90097, 0x70115, 0x8007b, 0x8003b, 0x900d7,
    0x7010d, 0x8006b, 0x8002b, 0x900b7, 0x8000b, 0x8008b, 0x8004b, 0x900f7,
    0x70103, 0x80057, 0x80017, 0x8011f, 0x70113, 0x80077, 0x80037, 0x900cf,
    0x7010b, 0x80067, 0x80027, 0x900af, 0x80007, 0x80087, 0x80047, 0x900ef,
    0x70107, 0x8005f, 0x8001f, 0x9009f, 0x70117, 0x8007f, 0x8003f, 0x900df,
    0x7010f, 0x8006f, 0x8002f, 0x900bf, 0x8000f, 0x8008f, 0x8004f, 0x900ff
  ]), 9];

  var fixedDistCodeTab = [new Uint32Array([
    0x50000, 0x50010, 0x50008, 0x50018, 0x50004, 0x50014, 0x5000c, 0x5001c,
    0x50002, 0x50012, 0x5000a, 0x5001a, 0x50006, 0x50016, 0x5000e, 0x00000,
    0x50001, 0x50011, 0x50009, 0x50019, 0x50005, 0x50015, 0x5000d, 0x5001d,
    0x50003, 0x50013, 0x5000b, 0x5001b, 0x50007, 0x50017, 0x5000f, 0x00000
  ]), 5];

  function error(e) {
    throw new Error(e)
  }

  function constructor(bytes) {
    //var bytes = stream.getBytes();
    var bytesPos = 0;

    var cmf = bytes[bytesPos++];
    var flg = bytes[bytesPos++];
    if (cmf == -1 || flg == -1)
      error('Invalid header in flate stream');
    if ((cmf & 0x0f) != 0x08)
      error('Unknown compression method in flate stream');
    if ((((cmf << 8) + flg) % 31) != 0)
      error('Bad FCHECK in flate stream');
    if (flg & 0x20)
      error('FDICT bit set in flate stream');

    this.bytes = bytes;
    this.bytesPos = bytesPos;

    this.codeSize = 0;
    this.codeBuf = 0;

    DecodeStream.call(this);
  }

  constructor.prototype = Object.create(DecodeStream.prototype);

  constructor.prototype.getBits = function(bits) {
    var codeSize = this.codeSize;
    var codeBuf = this.codeBuf;
    var bytes = this.bytes;
    var bytesPos = this.bytesPos;

    var b;
    while (codeSize < bits) {
      if (typeof (b = bytes[bytesPos++]) == 'undefined')
        error('Bad encoding in flate stream');
      codeBuf |= b << codeSize;
      codeSize += 8;
    }
    b = codeBuf & ((1 << bits) - 1);
    this.codeBuf = codeBuf >> bits;
    this.codeSize = codeSize -= bits;
    this.bytesPos = bytesPos;
    return b;
  };

  constructor.prototype.getCode = function(table) {
    var codes = table[0];
    var maxLen = table[1];
    var codeSize = this.codeSize;
    var codeBuf = this.codeBuf;
    var bytes = this.bytes;
    var bytesPos = this.bytesPos;

    while (codeSize < maxLen) {
      var b;
      if (typeof (b = bytes[bytesPos++]) == 'undefined')
        error('Bad encoding in flate stream');
      codeBuf |= (b << codeSize);
      codeSize += 8;
    }
    var code = codes[codeBuf & ((1 << maxLen) - 1)];
    var codeLen = code >> 16;
    var codeVal = code & 0xffff;
    if (codeSize == 0 || codeSize < codeLen || codeLen == 0)
      error('Bad encoding in flate stream');
    this.codeBuf = (codeBuf >> codeLen);
    this.codeSize = (codeSize - codeLen);
    this.bytesPos = bytesPos;
    return codeVal;
  };

  constructor.prototype.generateHuffmanTable = function(lengths) {
    var n = lengths.length;

    // find max code length
    var maxLen = 0;
    for (var i = 0; i < n; ++i) {
      if (lengths[i] > maxLen)
        maxLen = lengths[i];
    }

    // build the table
    var size = 1 << maxLen;
    var codes = new Uint32Array(size);
    for (var len = 1, code = 0, skip = 2;
         len <= maxLen;
         ++len, code <<= 1, skip <<= 1) {
      for (var val = 0; val < n; ++val) {
        if (lengths[val] == len) {
          // bit-reverse the code
          var code2 = 0;
          var t = code;
          for (var i = 0; i < len; ++i) {
            code2 = (code2 << 1) | (t & 1);
            t >>= 1;
          }

          // fill the table entries
          for (var i = code2; i < size; i += skip)
            codes[i] = (len << 16) | val;

          ++code;
        }
      }
    }

    return [codes, maxLen];
  };

  constructor.prototype.readBlock = function() {
    function repeat(stream, array, len, offset, what) {
      var repeat = stream.getBits(len) + offset;
      while (repeat-- > 0)
        array[i++] = what;
    }

    // read block header
    var hdr = this.getBits(3);
    if (hdr & 1)
      this.eof = true;
    hdr >>= 1;

    if (hdr == 0) { // uncompressed block
      var bytes = this.bytes;
      var bytesPos = this.bytesPos;
      var b;

      if (typeof (b = bytes[bytesPos++]) == 'undefined')
        error('Bad block header in flate stream');
      var blockLen = b;
      if (typeof (b = bytes[bytesPos++]) == 'undefined')
        error('Bad block header in flate stream');
      blockLen |= (b << 8);
      if (typeof (b = bytes[bytesPos++]) == 'undefined')
        error('Bad block header in flate stream');
      var check = b;
      if (typeof (b = bytes[bytesPos++]) == 'undefined')
        error('Bad block header in flate stream');
      check |= (b << 8);
      if (check != (~blockLen & 0xffff))
        error('Bad uncompressed block length in flate stream');

      this.codeBuf = 0;
      this.codeSize = 0;

      var bufferLength = this.bufferLength;
      var buffer = this.ensureBuffer(bufferLength + blockLen);
      var end = bufferLength + blockLen;
      this.bufferLength = end;
      for (var n = bufferLength; n < end; ++n) {
        if (typeof (b = bytes[bytesPos++]) == 'undefined') {
          this.eof = true;
          break;
        }
        buffer[n] = b;
      }
      this.bytesPos = bytesPos;
      return;
    }

    var litCodeTable;
    var distCodeTable;
    if (hdr == 1) { // compressed block, fixed codes
      litCodeTable = fixedLitCodeTab;
      distCodeTable = fixedDistCodeTab;
    } else if (hdr == 2) { // compressed block, dynamic codes
      var numLitCodes = this.getBits(5) + 257;
      var numDistCodes = this.getBits(5) + 1;
      var numCodeLenCodes = this.getBits(4) + 4;

      // build the code lengths code table
      var codeLenCodeLengths = Array(codeLenCodeMap.length);
      var i = 0;
      while (i < numCodeLenCodes)
        codeLenCodeLengths[codeLenCodeMap[i++]] = this.getBits(3);
      var codeLenCodeTab = this.generateHuffmanTable(codeLenCodeLengths);

      // build the literal and distance code tables
      var len = 0;
      var i = 0;
      var codes = numLitCodes + numDistCodes;
      var codeLengths = new Array(codes);
      while (i < codes) {
        var code = this.getCode(codeLenCodeTab);
        if (code == 16) {
          repeat(this, codeLengths, 2, 3, len);
        } else if (code == 17) {
          repeat(this, codeLengths, 3, 3, len = 0);
        } else if (code == 18) {
          repeat(this, codeLengths, 7, 11, len = 0);
        } else {
          codeLengths[i++] = len = code;
        }
      }

      litCodeTable =
          this.generateHuffmanTable(codeLengths.slice(0, numLitCodes));
      distCodeTable =
          this.generateHuffmanTable(codeLengths.slice(numLitCodes, codes));
    } else {
      error('Unknown block type in flate stream');
    }

    var buffer = this.buffer;
    var limit = buffer ? buffer.length : 0;
    var pos = this.bufferLength;
    while (true) {
      var code1 = this.getCode(litCodeTable);
      if (code1 < 256) {
        if (pos + 1 >= limit) {
          buffer = this.ensureBuffer(pos + 1);
          limit = buffer.length;
        }
        buffer[pos++] = code1;
        continue;
      }
      if (code1 == 256) {
        this.bufferLength = pos;
        return;
      }
      code1 -= 257;
      code1 = lengthDecode[code1];
      var code2 = code1 >> 16;
      if (code2 > 0)
        code2 = this.getBits(code2);
      var len = (code1 & 0xffff) + code2;
      code1 = this.getCode(distCodeTable);
      code1 = distDecode[code1];
      code2 = code1 >> 16;
      if (code2 > 0)
        code2 = this.getBits(code2);
      var dist = (code1 & 0xffff) + code2;
      if (pos + len >= limit) {
        buffer = this.ensureBuffer(pos + len);
        limit = buffer.length;
      }
      for (var k = 0; k < len; ++k, ++pos)
        buffer[pos] = buffer[pos - dist];
    }
  };

  return constructor;
})();

/*
* FileSaver.js
* A saveAs() FileSaver implementation.
*
* By Eli Grey, http://eligrey.com
*
* License : https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md (MIT)
* source  : http://purl.eligrey.com/github/FileSaver.js
*/


// The one and only way of getting global scope in all environments
// https://stackoverflow.com/q/3277182/1008999
var _global = typeof window === 'object' && window.window === window
    ? window : typeof self === 'object' && self.self === self
        ? self : typeof global === 'object' && global.global === global
            ? global
            : this

function bom (blob, opts) {
  if (typeof opts === 'undefined') opts = { autoBom: false }
  else if (typeof opts !== 'object') {
    console.warn('Deprecated: Expected third argument to be a object')
    opts = { autoBom: !opts }
  }

  // prepend BOM for UTF-8 XML and text/* types (including HTML)
  // note: your browser will automatically convert UTF-16 U+FEFF to EF BB BF
  if (opts.autoBom && /^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) {
    return new Blob([String.fromCharCode(0xFEFF), blob], { type: blob.type })
  }
  return blob
}

function download (url, name, opts) {
  var xhr = new XMLHttpRequest()
  xhr.open('GET', url)
  xhr.responseType = 'blob'
  xhr.onload = function () {
    saveAs(xhr.response, name, opts)
  }
  xhr.onerror = function () {
    console.error('could not download file')
  }
  xhr.send()
}

function corsEnabled (url) {
  var xhr = new XMLHttpRequest()
  // use sync to avoid popup blocker
  xhr.open('HEAD', url, false)
  xhr.send()
  return xhr.status >= 200 && xhr.status <= 299
}

// `a.click()` doesn't work for all browsers (#465)
function click(node) {
  try {
    node.dispatchEvent(new MouseEvent('click'))
  } catch (e) {
    var evt = document.createEvent('MouseEvents')
    evt.initMouseEvent('click', true, true, window, 0, 0, 0, 80,
        20, false, false, false, false, 0, null)
    node.dispatchEvent(evt)
  }
}

var saveAs = _global.saveAs || (
    // probably in some web worker
    (typeof window !== 'object' || window !== _global)
        ? function saveAs () { /* noop */ }

        // Use download attribute first if possible (#193 Lumia mobile)
        : 'download' in HTMLAnchorElement.prototype
        ? function saveAs (blob, name, opts) {
          var URL = _global.URL || _global.webkitURL
          var a = document.createElement('a')
          name = name || blob.name || 'download'

          a.download = name
          a.rel = 'noopener' // tabnabbing

          // TODO: detect chrome extensions & packaged apps
          // a.target = '_blank'

          if (typeof blob === 'string') {
            // Support regular links
            a.href = blob
            if (a.origin !== location.origin) {
              corsEnabled(a.href)
                  ? download(blob, name, opts)
                  : click(a, a.target = '_blank')
            } else {
              click(a)
            }
          } else {
            // Support blobs
            a.href = URL.createObjectURL(blob)
            setTimeout(function () { URL.revokeObjectURL(a.href) }, 4E4) // 40s
            setTimeout(function () { click(a) }, 0)
          }
        }

        // Use msSaveOrOpenBlob as a second approach
        : 'msSaveOrOpenBlob' in navigator
            ? function saveAs (blob, name, opts) {
              name = name || blob.name || 'download'

              if (typeof blob === 'string') {
                if (corsEnabled(blob)) {
                  download(blob, name, opts)
                } else {
                  var a = document.createElement('a')
                  a.href = blob
                  a.target = '_blank'
                  setTimeout(function () { click(a) })
                }
              } else {
                navigator.msSaveOrOpenBlob(bom(blob, opts), name)
              }
            }

            // Fallback to using FileReader and a popup
            : function saveAs (blob, name, opts, popup) {
              // Open a popup immediately do go around popup blocker
              // Mostly only available on user interaction and the fileReader is async so...
              popup = popup || open('', '_blank')
              if (popup) {
                popup.document.title =
                    popup.document.body.innerText = 'downloading...'
              }

              if (typeof blob === 'string') return download(blob, name, opts)

              var force = blob.type === 'application/octet-stream'
              var isSafari = /constructor/i.test(_global.HTMLElement) || _global.safari
              var isChromeIOS = /CriOS\/[\d]+/.test(navigator.userAgent)

              if ((isChromeIOS || (force && isSafari)) && typeof FileReader === 'object') {
                // Safari doesn't allow downloading of blob URLs
                var reader = new FileReader()
                reader.onloadend = function () {
                  var url = reader.result
                  url = isChromeIOS ? url : url.replace(/^data:[^;]*;/, 'data:attachment/file;')
                  if (popup) popup.location.href = url
                  else location = url
                  popup = null // reverse-tabnabbing #460
                }
                reader.readAsDataURL(blob)
              } else {
                var URL = _global.URL || _global.webkitURL
                var url = URL.createObjectURL(blob)
                if (popup) popup.location = url
                else location.href = url
                popup = null // reverse-tabnabbing #460
                setTimeout(function () { URL.revokeObjectURL(url) }, 4E4) // 40s
              }
            }
)

_global.saveAs = saveAs.saveAs = saveAs

if (typeof module !== 'undefined') {
  module.exports = saveAs;
}
