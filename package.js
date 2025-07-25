Package.describe({
  name: "mizzao:partitioner",
  summary: "Transparently divide a meteor app into different instances shared between groups of users.",
  version: "0.6.0-beta.1",
  git: "https://github.com/mizzao/meteor-partitioner.git"
});

Package.onUse(function (api) {
  api.versionsFrom(["1.12.1", '2.3.6']);

  // Client & Server deps
  api.use([
    'accounts-base',
    'underscore',
    'coffeescript@1.12.7_3 || 2.4.1',
    'check',
    'ddp', // Meteor.publish available
    'mongo' // Mongo.Collection available
  ]);

  api.use("matb33:collection-hooks@1.0.1");

  api.addFiles('common.js');

  api.addFiles('grouping.js', 'server');
  api.addFiles('grouping_client.js', 'client');

  api.export(['Partitioner', 'Grouping']);

  // Package-level variables that should not be exported
  // See http://docs.meteor.com/#/full/coffeescript
  api.export(['ErrMsg', 'Helpers'], {testOnly: true});

  api.export('TestFuncs', {testOnly: true});
});

Package.onTest(function (api) {
  api.use("mizzao:partitioner");

  api.use([
    'accounts-base',
    'accounts-password', // For createUser
    'coffeescript@1.12.7_3 || 2.4.1',
    'underscore',
    'ddp', // Meteor.publish available
    'mongo', // Mongo.Collection available
    'tracker' // Deps/Tracker available
  ]);

  api.use([
    'tinytest',
    'test-helpers'
  ]);

  api.addFiles("tests/insecure_login.js");

  api.addFiles('tests/hook_tests.js');
  api.addFiles('tests/grouping_index_tests.js', 'server');
  api.addFiles('tests/grouping_tests.js');
});
