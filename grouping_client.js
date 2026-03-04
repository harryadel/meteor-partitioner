Partitioner = {};

/*
  Client selector modifiers
*/

Partitioner.group = function() {
  const userId = Meteor.userId();
  if (!userId) return;
  const user = Meteor.users.findOne(userId, {fields: {group: 1}});
  return user != null ? user.group : undefined;
};

const userFindHook = function(userId, selector, options) {
  // Do the usual find for no user or single selector
  if (!userId || Helpers.isDirectUserSelector(selector)) return true;

  // No hooking needed for regular users, taken care of on server
  const user = Meteor.user();
  if (!(user != null ? user.admin : undefined)) return true;

  // Don't have admin see itself for global finds.
  // collection-hooks v2 passes selector as a parameter (not via this.args).
  // normalizeSelector + _getFindSelector ensure selector is always an object.
  if (selector != null && typeof selector === 'object') {
    selector.admin = {$exists: false};
  }
  return true;
};

Meteor.users.before.find(userFindHook);
Meteor.users.before.findOne(userFindHook);

const insertHook = function(userId, doc) {
  if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
  const groupId = Partitioner.group();
  if (!groupId) throw new Meteor.Error(403, ErrMsg.groupErr);
  doc._groupId = groupId;
  return true;
};

// Add in groupId for client so as not to cause unexpected sync changes
Partitioner.partitionCollection = function(collection) {
  // No find hooks needed if server side filtering works properly

  collection.before.insert(insertHook);
};

TestFuncs = {
  userFindHook: userFindHook,
  insertHook: insertHook
}; 