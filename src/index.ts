import { Neo4jGraphQL } from '@neo4j/graphql';
import { ApolloServer } from 'apollo-server';
import neo4j from 'neo4j-driver';
import { mergeTypeDefs } from '@graphql-tools/merge';
import * as dotenv from 'dotenv';
import getSchemaFromGithub from './getSchemaFromGithub';

const startServer = async () => {
  //// env stuff
  dotenv.config();
  const {
    NEO_URI,
    NEO_USER,
    NEO_PASS,
    PORT,
    PRODUCTION,
    GITHUB_ACCESS_TOKEN,
    GITHUB_CLIENT_ID,
    GITHUB_REPO_OWNER,
    GITHUB_REPO_NAME,
    GITHUB_TARGET_FILE_PATH,
  } = process.env;

  if (
    NEO_URI === undefined ||
    NEO_USER === undefined ||
    NEO_PASS === undefined ||
    PORT === undefined ||
    PRODUCTION === undefined ||
    GITHUB_ACCESS_TOKEN === undefined ||
    GITHUB_CLIENT_ID === undefined ||
    GITHUB_REPO_OWNER === undefined ||
    GITHUB_REPO_NAME === undefined ||
    GITHUB_TARGET_FILE_PATH === undefined
  ) {
    console.error('undefined environment variables');
    return;
  }
  console.log(`Production mode is: ${PRODUCTION}`);

  const plaintextSchema = await getSchemaFromGithub({
    accessToken: GITHUB_ACCESS_TOKEN,
    repoName: GITHUB_REPO_NAME,
    repoOwner: GITHUB_REPO_OWNER,
    filePath: GITHUB_TARGET_FILE_PATH,
  });
  if (plaintextSchema === undefined) {
    throw new Error(
      `Could not get a schema from ${JSON.stringify(
        {
          repoName: GITHUB_REPO_NAME,
          repoOwner: GITHUB_REPO_OWNER,
          filePath: GITHUB_TARGET_FILE_PATH,
        },
        null,
        2,
      )}`,
    );
  }

  //// schema stuff
  const typeDefs = mergeTypeDefs([plaintextSchema]);
  const driver = neo4j.driver(NEO_URI, neo4j.auth.basic(NEO_USER, NEO_PASS));
  const neoSchema = new Neo4jGraphQL({
    typeDefs,
    driver,
  });

  const customLogger = {
    ...console,
    debug: async (msg: any) => {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] [DEBUG]: ${msg}`);
    },
  };

  Promise.all([neoSchema.getSchema()]).then(([schema]) => {
    const server = new ApolloServer({
      schema,
      introspection: PRODUCTION === 'FALSE',
      logger: customLogger,
      context: async ({ req }) => {
        return { req, driver };
      },
      plugins: [
        {
          async requestDidStart(ctx) {
            ctx.logger.debug(JSON.stringify(ctx.request, null, 2));
          },
        },
      ],
    });

    const shutdown = () => {
      console.log('Shutting down server');
      server.stop().then(async () => {
        // shut down neo4j driver
        await driver.close();
        console.log('Server stopped');
        process.exit();
      });
    };

    // Listen for SIGINT signal
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    server.listen(PORT).then(({ url }) => {
      console.log(`🚀 Server ready at ${url}`);
    });
  });
};

startServer();
