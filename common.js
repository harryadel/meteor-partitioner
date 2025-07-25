const ErrMsg = {
  userIdErr: "Must be logged in to operate on partitioned collection",
  groupErr: "Must have group assigned to operate on partitioned collection"
};

const Helpers = {
  isDirectSelector: function(selector) {
    return _.isString(selector) || _.isString(selector != null ? selector._id : undefined);
  },

  // Because of https://github.com/HarvardEconCS/turkserver-meteor/issues/44
  // _id: { $in: [ ... ] } queries should be short-circuited as well for users
  isDirectUserSelector: function(selector) {
    return _.isString(selector) ||
      _.isString(selector != null ? selector._id : undefined) ||
      _.isString(selector != null ? selector.username : undefined) ||
      (_.isObject(selector != null ? selector._id : undefined) && (selector._id.$in != null));
  }
}; 