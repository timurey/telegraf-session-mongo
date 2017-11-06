const debug = require('debug')('telegraf:session-mongo');
// const util  = require('util');
// const inspect = (o, depth = 1) => console.log(util.inspect(o, { colors: true, depth }));


var MongoSession = (function (Client, Options) {
  var instance;
  var options;
  var client;
  var collection;

  var getSession = async (key) => {
    debug('Getting session for %s', key);
    const document = await collection.findOne({ key });
    return (document || { data: {} }).data;
  }

  var saveSession = async (key, data) => {
    if (!data || Object.keys(data).length === 0) {
      debug(`Deleting session: ${key}`);
      await collection.deleteOne({ key });
      return;
    }
    const $unset = data.$unset;
    delete data.$unset;
    const payload = Object.assign({},
      {
        key,
        data,
        expireAt: new Date((new Date()).getTime() + (options.ttl))
      }, $unset);
    debug('Saving session %s %o', key, payload);
    await collection.updateOne({ key }, payload, { upsert: true });
  }

  var middleware = () => {
    return async (ctx, next) => {
      const key = options.getSessionKey(ctx);
      if (!key) { return await next(); }

      const session = await getSession(key);

      Object.defineProperty(ctx, options.property, {
        get() { return session },
        set(value) { session = Object.assign({}, value); },
        getSession(key) { return getSession(key) }
      });

      await next();
      await saveSession(key, session);
    }
  }

  var setup = async () => {
    await collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
    await collection.createIndex({ key: 1 });
  }

  return function Construct_singletone(Client, Options) {
    if (instance) {
      return instance;
    }
    if (this && this.constructor === Construct_singletone) {
      instance = {
        middleware: middleware,
        setup: setup
      };
      options = Object.assign({
        property: 'session',
        collection: 'sessions',
        ttl: 3600 * 1000,
        getSessionKey(ctx) {
          if (!ctx.chat || !ctx.from) { return; }
          return `${ctx.chat.id}:${ctx.from.id}`;
        },
        store: {}
      }, Options);
      client = Client
      collection = client.collection(options.collection);
    } else {
      return new Construct_singletone(Client, Options);
    }

  }
}());

module.exports = MongoSession;
// module.exports.MongoSessionError = MongoSessionError;