 
const chai = require('chai');

chai.should();

const defaultConfig = require('../../src/helpers/default-config');
const validate = require('../../src/helpers/validate');

describe('validate', () => {
  describe('when config is null or undefined', () => {
    const config = validate();

    it(`then title === ${defaultConfig.title}`, () => {
      config.title.should.equal(defaultConfig.title);
    });

    it(`then path === ${defaultConfig.path}`, () => {
      config.path.should.equal(defaultConfig.path);
    });

    it(`then span.interval === ${defaultConfig.span.interval}`, () => {
      config.span.interval.should.equal(defaultConfig.span.interval);
    });

    it('then port === null', () => {
      chai.expect(config.port).to.be.null;
    });

    it('then websocket === null', () => {
      chai.expect(config.websocket).to.be.null;
    });

    it(`then darkMode === ${defaultConfig.darkMode}`, () => {
      config.darkMode.should.equal(defaultConfig.darkMode);
    });

    it('then dataDir === null', () => {
      chai.expect(config.dataDir).to.be.null;
    });

    it(`then flushInterval === ${defaultConfig.flushInterval}`, () => {
      config.flushInterval.should.equal(defaultConfig.flushInterval);
    });
  });

  describe('when config is invalid', () => {
    const config = validate({ title: true, path: false, span: 'not-an-object', port: 'abc', websocket: false, darkMode: 123 });

    it(`then title === ${defaultConfig.title}`, () => {
      config.title.should.equal(defaultConfig.title);
    });

    it(`then path === ${defaultConfig.path}`, () => {
      config.path.should.equal(defaultConfig.path);
    });

    it(`then span.interval === ${defaultConfig.span.interval}`, () => {
      config.span.interval.should.equal(defaultConfig.span.interval);
    });

    it('then port === null', () => {
      chai.expect(config.port).to.be.null;
    });

    it('then websocket === null', () => {
      chai.expect(config.websocket).to.be.null;
    });

    it(`then darkMode === ${defaultConfig.darkMode}`, () => {
      config.darkMode.should.equal(defaultConfig.darkMode);
    });

    it('then dataDir === null', () => {
      chai.expect(config.dataDir).to.be.null;
    });

    it(`then flushInterval === ${defaultConfig.flushInterval}`, () => {
      config.flushInterval.should.equal(defaultConfig.flushInterval);
    });
  });

  describe('when config is valid', () => {
    const customConfig = { title: 'Custom title', path: '/custom-path', span: { interval: 5 }, port: 9999, websocket: {}, darkMode: 'dark' };
    const config = validate(customConfig);

    it(`then title === ${customConfig.title}`, () => {
      config.title.should.equal(customConfig.title);
    });

    it(`then path === ${customConfig.path}`, () => {
      config.path.should.equal(customConfig.path);
    });

    it('then span.interval === 5', () => {
      config.span.interval.should.equal(5);
    });

    it('then websocket === {}', () => {
      config.websocket.should.deep.equal({});
    });

    it(`then port === ${customConfig.port}`, () => {
      config.port.should.equal(customConfig.port);
    });

    it(`then darkMode === ${customConfig.darkMode}`, () => {
      config.darkMode.should.equal(customConfig.darkMode);
    });

    it('then dataDir === /tmp/custom-dir', () => {
      const customWithDir = validate({ dataDir: '/tmp/custom-dir', flushInterval: 60 });
      customWithDir.dataDir.should.equal('/tmp/custom-dir');
      customWithDir.flushInterval.should.equal(60);
    });
  });

  describe('backward compatibility: spans[] → span', () => {
    it('should migrate spans[0].interval to span.interval', () => {
      const config = validate({ spans: [{ interval: 10, retention: 60 }] });
      config.span.interval.should.equal(10);
      chai.expect(config.spans).to.be.undefined;
    });
  });
});
