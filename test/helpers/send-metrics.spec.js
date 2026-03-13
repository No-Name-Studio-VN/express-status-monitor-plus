const chai = require('chai');
const sinon = require('sinon');

chai.should();

const sendMetrics = require('../../src/helpers/send-metrics');

describe('send-metrics', () => {
  describe('when invoked', () => {
    it('then io.emit called with esm_stats', () => {
      const io = { emit: sinon.stub() };
      const span = { os: [], responses: [] };

      sendMetrics(io, span);

      sinon.assert.calledWith(io.emit, 'esm_stats');
    });
  });
});
