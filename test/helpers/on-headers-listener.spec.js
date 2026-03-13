const chai = require('chai');
const sinon = require('sinon');

chai.should();

const onHeadersListener = require('../../src/helpers/on-headers-listener');
const defaultConfig = require('../../src/helpers/default-config');

describe('on-headers-listener', () => {
  describe('when invoked', () => {
    const clock = sinon.useFakeTimers();
    const span = { ...defaultConfig.span, responses: [] };

    after(() => {
      clock.restore();
    });

    it('then responses length should equal 1', () => {
      onHeadersListener(404, process.hrtime(), span);

      span.responses.length.should.equal(1);
    });

    describe('when invoked after span interval', () => {
      it('then responses length should equal 2', () => {
        clock.tick(span.interval * 1000 + 10);
        onHeadersListener(500, process.hrtime(), span);

        span.responses.length.should.equal(2);
      });
    });
  });
});
