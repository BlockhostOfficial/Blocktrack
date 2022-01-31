FROM node:17

ARG TINI_VER="v0.19.0"

# install tini
ADD https://github.com/krallin/tini/releases/download/$TINI_VER/tini /sbin/tini
RUN chmod +x /sbin/tini

# install sqlite3
RUN apt-get update \
 && apt-get install --quiet --yes --no-install-recommends sqlite3 python \
 && apt-get clean  --quiet --yes \
 && apt-get autoremove --quiet --yes \
 && rm -rf /var/src/apt/lists/*

# copy minetrack files
WORKDIR /usr/src/minetrack
COPY . .

# run as non root
RUN addgroup --gid 10043 --system minetrack \
 && adduser --uid 10042 --system --ingroup minetrack --gecos "" minetrack \
 && chown -R minetrack:minetrack /usr/src/minetrack
USER minetrack

# install node packages
RUN yarn install

EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--", "yarn", "run-server"]
