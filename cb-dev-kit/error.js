const chalkProm = import('chalk');

module.exports = (message, exit) => {
  chalkProm.then((chalk) => {
    console.error(chalk.default.red(message));
    exit && process.exit(1);
  });
};
