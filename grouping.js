/*
  SERVER METHODS
  Hook in group id to all operations, including find

  Grouping contains _id: userId and groupId: groupId
*/

Partitioner = {};
const Grouping = new Mongo.Collection("ts.grouping");

// Meteor environment variables for scoping group operations
Partitioner._currentGroup = new Meteor.EnvironmentVariable();
Partitioner._directOps = new Meteor.EnvironmentVariable();

/*
   Public API
*/

Partitioner.setUserGroup = async function(userId, groupId) {
  check(userId, String);
  check(groupId, String);
  if (await Grouping.findOneAsync(userId)) {
    throw new Meteor.Error(403, "User is already in a group");
  }

  const result = await Grouping.upsertAsync(userId, {
    $set: {groupId: groupId}
  });
  
  return result;
};

Partitioner.getUserGroup = async function(userId) {
  check(userId, String);
  const grouping = await Grouping.findOneAsync(userId);
  return grouping != null ? grouping.groupId : undefined;
};

Partitioner.clearUserGroup = async function(userId) {
  check(userId, String);
  await Grouping.removeAsync(userId);
};

Partitioner.group = async function() {
  // If group is overridden, return that instead
  const groupId = Partitioner._currentGroup.get();
  if (groupId != null) {
    return groupId;
  }
  let userId;
  try { // We may be outside of a method
    userId = Meteor.userId();
  } catch (e) {
    // Handle the case where we're outside of a method
  }
  if (!userId) return;
  return await Partitioner.getUserGroup(userId);
};

Partitioner.bindGroup = async function(groupId, func) {
  const result = await Partitioner._currentGroup.withValue(groupId, func);
  console.log("RESULT: ", result)
  return result;
};

Partitioner.bindUserGroup = async function(userId, func) {
  const groupId = await Partitioner.getUserGroup(userId);
  if (!groupId) {
    Meteor._debug(`Dropping operation because ${userId} is not in a group`);
    return;
  }
  Partitioner.bindGroup(groupId, func);
};

Partitioner.directOperation = function(func) {
  Partitioner._directOps.withValue(true, func);
};

// This can be replaced - currently not documented
Partitioner._isAdmin = async function(userId) {
  const user = await Meteor.users.findOneAsync(userId, {fields: {groupId: 1, admin: 1}});
  return user.admin === true;
};

const getPartitionedIndex = function(index) {
  const defaultIndex = {_groupId: 1};
  if (!index) return defaultIndex;
  return Object.assign(defaultIndex, index);
};

Partitioner.partitionCollection = async function(collection, options) {
  // Because of the deny below, need to create an allow validator
  // on an insecure collection if there isn't one already
  if (collection._isInsecure()) {
    collection.allow({
      insert: () => true,
      update: () => true,
      remove: () => true
    });
  }

  // Idiot-proof the collection against admin users
  collection.deny({
    insert: Partitioner._isAdmin,
    update: Partitioner._isAdmin,
    remove: Partitioner._isAdmin
  });

  collection.before.find(findHook);
  collection.before.findOne(findHook);

  // These will hook the _validated methods as well
  collection.before.insert(insertHook);

  /*
    No update/remove hook necessary, see
    https://github.com/matb33/meteor-collection-hooks/issues/23
  */

  // Index the collections by groupId on the server for faster lookups across groups
  collection.createIndex(getPartitionedIndex(options != null ? options.index : undefined), options != null ? options.indexOptions : undefined);
};

// Publish admin and group for users that have it
Meteor.publish(null, function() {
  if (!this.userId) return;
  return Meteor.users.find(this.userId, {
    fields: {
      admin: 1,
      group: 1
    }
  });
});

// Special hook for Meteor.users to scope for each group
const userFindHook = function(userId, selector, options) {
  if (Partitioner._directOps.get() === true) return true;
  if (Helpers.isDirectUserSelector(selector)) return true;

  let groupId = Partitioner._currentGroup.get();
  // This hook doesn't run if we're not in a method invocation or publish
  // function, and Partitioner._currentGroup is not set
  if (!userId && !groupId) return true;

  if (!groupId) {
    // CANNOT do any async database calls here!
    // Must fail fast and require proper context setup
    throw new Meteor.Error(403, ErrMsg.groupFindErr);
  }

  // Since user is in a group, scope the find to the group
  const filter = {
    "group": groupId,
    "admin": {$exists: false}
  };

  if (!this.args[0]) {
    this.args[0] = filter;
  } else {
    Object.assign(this.args[0], filter);
  }

  return true;
};

// Attach the find hooks to Meteor.users
Meteor.users.before.find(userFindHook);
Meteor.users.before.findOne(userFindHook);

// No allow/deny for find so we make our own checks
const findHook = function(userId, selector, options) {
  // Don't scope for direct operations
  if (Partitioner._directOps.get() === true) return true;

  // for find(id) we should not touch this
  // TODO this may allow arbitrary finds across groups with the right _id
  // We could amend this in the future to {_id: someId, _groupId: groupId}
  // https://github.com/mizzao/meteor-partitioner/issues/9
  // https://github.com/mizzao/meteor-partitioner/issues/10
  if (Helpers.isDirectSelector(selector)) return true;

  // Check for global hook
  let groupId = Partitioner._currentGroup.get();

  if (!userId && !groupId) {
    throw new Meteor.Error(403, ErrMsg.userIdErr);
  }

  if (userId) {
    if (!groupId) {
      if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
      // CANNOT do any async database calls here!
      // Must fail fast and require proper context setup
      throw new Meteor.Error(403, ErrMsg.groupFindErr);
    }

    // if object (or empty) selector, just filter by group
    if (selector == null) {
      this.args[0] = {_groupId: groupId};
    } else {
      selector._groupId = groupId;
    }

    // Adjust options to not return _groupId
    if (options == null) {
      this.args[1] = {fields: {_groupId: 0}};
    } else {
      // If options already exist, add {_groupId: 0} unless fields has {foo: 1} somewhere
      if (options.fields == null) options.fields = {};
      if (!Object.values(options.fields).some((v) => v === 1)) {
        options.fields._groupId = 0;
      }
    }
  }

  return true;
};

const insertHook = async function(userId, doc) {
  // Don't add group for direct inserts
  if (Partitioner._directOps.get() === true) return true;

  let groupId = Partitioner._currentGroup.get();
  if (!groupId) {
    if (!userId) throw new Meteor.Error(403, ErrMsg.userIdErr);
    const grouping = await Grouping.findOneAsync(userId);
    groupId = grouping?.groupId;
    if (!groupId) throw new Meteor.Error(403, ErrMsg.groupErr);
  }

  doc._groupId = groupId;
  return true;
};

// Sync grouping needed for hooking Meteor.users
Grouping.find().observeChangesAsync({
  added: async function(id, fields) {
    if (!await Meteor.users.updateAsync(id, {$set: {"group": fields.groupId}})) {
      Meteor._debug(`Tried to set group for nonexistent user ${id}`);
    }
  },
  changed: async function(id, fields) {
    if (!await Meteor.users.updateAsync(id, {$set: {"group": fields.groupId}})) {
      Meteor._debug(`Tried to change group for nonexistent user ${id}`);
    }
  },
  removed: async function(id) {
    if (!await Meteor.users.updateAsync(id, {$unset: {"group": null}})) {
      Meteor._debug(`Tried to unset group for nonexistent user ${id}`);
    }
  }
});

TestFuncs = {
  getPartitionedIndex: getPartitionedIndex,
  userFindHook: userFindHook,
  findHook: findHook,
  insertHook: insertHook,
  Grouping: Grouping
}; 