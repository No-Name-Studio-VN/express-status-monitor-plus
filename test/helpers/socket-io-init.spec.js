const chai = require('chai');

chai.should();

const socketIoInit = require('../../src/helpers/socket-io-init');
const defaultConfig = require('../../src/helpers/default-config');

describe('socket-io-init', () => {
  describe('when invoked', () => {
    it('then span should have os and responses property', () => {
      const config = { ...defaultConfig, span: { ...defaultConfig.span } };
      const span = config.span;

      span.should.not.have.property('os');

      socketIoInit({}, config);

      span.should.have.property('os');
      span.should.have.property('responses');
    });
  });
});
