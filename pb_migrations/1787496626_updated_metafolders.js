/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("8xqqz23qvscrsfz")

  // add
  collection.schema.addField(new SchemaField({
    "system": false,
    "id": "ysp8ajt9",
    "name": "parentMetafolder",
    "type": "relation",
    "required": false,
    "presentable": false,
    "unique": false,
    "options": {
      "collectionId": "8xqqz23qvscrsfz",
      "cascadeDelete": false,
      "minSelect": null,
      "maxSelect": 1,
      "displayFields": null
    }
  }))

  return dao.saveCollection(collection)
}, (db) => {
  const dao = new Dao(db)
  const collection = dao.findCollectionByNameOrId("8xqqz23qvscrsfz")

  // remove
  collection.schema.removeField("ysp8ajt9")

  return dao.saveCollection(collection)
})
