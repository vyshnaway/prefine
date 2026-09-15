/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("avk8oayrdt3hf2o")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "smhsxqqn",
    "name": "parentMetafolder",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "avk8oayrdt3hf2o",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("avk8oayrdt3hf2o")

  // remove
  collection.schema.removeField("smhsxqqn")

  return dao.saveCollection(collection)
})
