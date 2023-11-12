require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const dns = require('dns');
let mongoose = require('mongoose');

// Basic Configuration
const port = process.env.PORT || 3000;

var bodyParser = require('body-parser')
app.use(bodyParser.json());       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

app.use(cors());

app.use('/public', express.static(`${process.cwd()}/public`));

app.get('/', function(req, res) {
  res.sendFile(process.cwd() + '/views/index.html');
});

// connect to cluster_0 db db 'testdata'
mongoose.connect(process.env.MONGO_URI);

const urlSchema = new mongoose.Schema({ shorturl: { type: String }, originalurl: { type: String } }, { collection: 'shorturls' })

const errorSchema = mongoose.Schema({ errorMsg: { type: String }, trace: { type: String } }, { collection: 'errors' })

let Urls = mongoose.model('Urls', urlSchema);
let Error = mongoose.model('Error', errorSchema)

const createAndSaveShortUrl = function(_originalUrl, _sortUrl) {
  const url = new Urls({ originalurl: _originalUrl, shorturl: _sortUrl })
  url.save();
}
const createAndSaveError = function(_errorMsg, _trace) {
  const er = new Error({ errorMsg: _errorMsg, trace: _trace });
  er.save();
}

var logger = function(req, res, next) {

  console.log(req.method + " " + req.path + " - " + req.ip);
  next();

}

app.use("/", logger);

// return promise
var dnsLookup = function(aUrl) {
  return new Promise((resolve, reject) => {
    dns.lookup(aUrl, (err, address, family) => {
      if (err) {
        console.log(err)
        reject(err);
      } else {
        resolve(address);
      }
    });
  });
};

app.post('/api/shorturl', async function(req, res) {

  const url = req.body.url;

  // check if url is in db
  const foundUrl = await Urls.findOne({ originalurl: url })

  // url alraedy in db
  if (foundUrl) {
    console.log('{ original_url:' + foundUrl.originalurl + ', short_url:' + foundUrl.shorturl + '}')
    res.json({ original_url: foundUrl.originalurl, short_url: foundUrl.shorturl });
  } else {

    try {

      const builtUrl = new URL(url);
      const hostname = builtUrl.hostname;

      console.log(hostname)

      // not in db - so add it
      // check if url is valid
      await dnsLookup(hostname).then(async function() {
        const shortUrl = Math.floor(Math.random() * 100000);
        await createAndSaveShortUrl(url, shortUrl);
        console.log('{ original_url:' + url + ', short_url:' + shortUrl + '}')
        res.json({ original_url: url, short_url: shortUrl });

      }).catch(async function() {
        await createAndSaveError("invalid url", "dns.lookup");
        console.log('{ error: invalid url}')
        res.json({ error: 'invalid url' });
      });

    } catch (err) {
      res.json({ error: 'invalid url' });
    }
  }
});

app.get('/api/shorturl/:short_url', async function(req, res) {

  const short_url = req.params.short_url;
  const findOriginalUrl = await Urls.findOne({ shorturl: short_url })
  res.redirect(findOriginalUrl.originalurl)

})

app.listen(port, function() {
  console.log(`Listening on port ${port}`);
});
