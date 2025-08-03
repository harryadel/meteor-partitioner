/*
  Set up server and client hooks
*/
let hookCollection;

const basicInsertCollection = new Mongo.Collection("basicInsert");
const twoGroupCollection = new Mongo.Collection("twoGroup");


const groupingCollections = {};

groupingCollections.basicInsert = basicInsertCollection;
groupingCollections.twoGroup = twoGroupCollection;

hookCollection = (collection) => {
  collection._insecure = true;
  // Attach the hooks to the collection
  Partitioner.partitionCollection(collection);
};



/*
  Hook collections and run tests
*/
hookCollection(basicInsertCollection);
hookCollection(twoGroupCollection);

// We create the collections in the publisher (instead of using a method or
// something) because if we made them with a method, we'd need to follow the
// method with some subscribes, and it's possible that the method call would
// be delayed by a wait method and the subscribe messages would be sent before
// it and fail due to the collection not yet existing. So we are very hacky
// and use a publish.
Meteor.publish("groupingTests", async function() {
  if (!this.userId) return;

  Partitioner.directOperation(async () => {
    await basicInsertCollection.removeAsync({});
    await twoGroupCollection.removeAsync({});
  });

  const cursors = [basicInsertCollection.find(), twoGroupCollection.find()];

  Meteor._debug("grouping publication activated");

  Partitioner.directOperation(async () => {
    await twoGroupCollection.insertAsync({
      _groupId: myGroup,
      a: 1
    });

    await twoGroupCollection.insertAsync({
      _groupId: otherGroup,
      a: 1
    });
  });

  Meteor._debug("collections configured");

  return cursors;
});

Meteor.methods({
  joinGroup: async function(myGroup) {
    const userId = Meteor.userId();
    if (!userId) throw new Error(403, "Not logged in");
    await Partitioner.clearUserGroup(userId);
    await Partitioner.setUserGroup(userId, myGroup);
  },
  serverInsert: async function(name, doc) {
    return groupingCollections[name].insertAsync(doc);
  },
  serverUpdate: async function(name, selector, mutator) {
    return groupingCollections[name].updateAsync(selector, mutator);
  },
  serverRemove: async function(name, selector) {
    return groupingCollections[name].removeAsync(selector);
  },
  getCollection: async function(name, selector) {
    return Partitioner.directOperation(async () => await groupingCollections[name].find(selector || {}).fetchAsync());
  },
  getMyCollection: async function(name, selector) {
    return await groupingCollections[name].find(selector).fetchAsync();
  }
});

Tinytest.addAsync("partitioner - grouping - undefined default group", async (test) => {
  const groupResult = await Partitioner.group();
  test.equal(groupResult, undefined);
});

// The overriding is done separately for hooks
Tinytest.addAsync("partitioner - grouping - override group environment variable", async (test) => {
  Partitioner.bindGroup("overridden", async () => {
    test.equal(await Partitioner.group(), "overridden");
  });
});

Tinytest.add("partitioner - collections - disallow arbitrary insert", (test) => {
  test.throws(async () => {
    await basicInsertCollection.insertAsync({foo: "bar"});
  }, (e) => e.error === 403 && e.reason === ErrMsg.userIdErr);
});

Tinytest.addAsync("partitioner - collections - insert with overridden group", async (test) => {
  Partitioner.bindGroup("overridden", async () => {
    await basicInsertCollection.insertAsync({foo: "bar"});
    const result = await basicInsertCollection.find({foo: "bar"}).fetchAsync();
    test.equal(result.length, 1);
    test.equal(result[0]._groupId, "overridden");
  });
});