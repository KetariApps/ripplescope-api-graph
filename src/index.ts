import { Neo4jGraphQL } from "@neo4j/graphql";
import { ApolloServer } from "apollo-server";
import neo4j from "neo4j-driver";
import path from "path";
import { loadFilesSync } from "@graphql-tools/load-files";
import { mergeTypeDefs } from "@graphql-tools/merge";
import * as dotenv from "dotenv";

const startServer = async () => {
  //// env stuff
  dotenv.config();
  const { NEO_URI, NEO_USER, NEO_PASS, PORT } = process.env;

  if (
    NEO_URI === undefined ||
    NEO_USER === undefined ||
    NEO_PASS === undefined ||
    PORT === undefined
  ) {
    console.error("undefined environment variables");
    return;
  }

  //// schema stuff
  const typesArray = loadFilesSync(path.join("./", "*.graphql"));
  const typeDefs = mergeTypeDefs(typesArray);
  const driver = neo4j.driver(NEO_URI, neo4j.auth.basic(NEO_USER, NEO_PASS));
  const neoSchema = new Neo4jGraphQL({
    typeDefs,
    driver,
  });

  Promise.all([neoSchema.getSchema()]).then(([schema]) => {
    const server = new ApolloServer({
      schema,
      context: async ({ req }) => {
        return { req, driver };
      },
    });

    const shutdown = () => {
      console.log("Shutting down server");
      server.stop().then(async () => {
        // shut down neo4j driver
        await driver.close();
        console.log("Server stopped");
        process.exit();
      });
    };

    // Listen for SIGINT signal
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    server.listen(PORT).then(({ url }) => {
      console.log(`🚀 Server ready at ${url}`);
    });
  });
};

startServer();
