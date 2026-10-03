/**
 * Background job registry. Each job module exports
 *   { name: string, intervalMs: number, run: () => Promise<void> }
 * and is added to JOBS below. Jobs run on a timer in the API process (fine for
 * a single droplet); a run never overlaps with itself, and errors are logged,
 * never thrown.
 */
const JOBS = [
  require('./reservationExpiry'),
];

const timers = [];
const running = new Set();

const runOnce = async (job) => {
  if (running.has(job.name)) return;
  running.add(job.name);
  try {
    await job.run();
  } catch (err) {
    console.error(`⚠️  job ${job.name} failed:`, err.message);
  } finally {
    running.delete(job.name);
  }
};

const start = () => {
  for (const job of JOBS) {
    timers.push(setInterval(() => runOnce(job), job.intervalMs));
    console.log(`⏲  job ${job.name} every ${Math.round(job.intervalMs / 1000)}s`);
  }
};

const stop = () => {
  while (timers.length) clearInterval(timers.pop());
};

module.exports = { start, stop, runOnce, JOBS };
