# 18f-pages-server

This server publishes static websites for [18F Pages](https://pages.18f.gov/).
It works very similarly to [GitHub pages](https://pages.github.com/). It
automatically publishes [Jekyll](http://jekyllrb.com/)-based web sites
whenever updates are made to a publishing branch (like `gh-pages`, but where
the name of the branch is defined by the server's configuration). It also
supports publishing via [`rsync`](https://rsync.samba.org/) if the publishing
branch does not contain a Jekyll-based site.

## Reusability

The server may be run by other organizations, as it is completely configurable
via the [`pages-config.json`](#pages-config) file. You may imagine replacing
all instances of "18F" in the instructions that follow with your own
organization's handle.

## Publishing

Once the server has been set up per the
[server installation instructions](#installation), commits to a repository's
publishing branch (e.g. `18f-pages`) will publish the site at
`https://PAGES_HOST/REPO_NAME`, where `PAGES_HOST` is the name of the host
running `18f-pages-server` and `REPO_NAME` is the name of the repository
without the organization prefix.

For example, `18F/guides-template` will publish to
https://pages.18f.gov/guides-template/.

The status of the most recent build attempt will be visible at
`https://PAGES_HOST/REPO_NAME/build.log`.

### Prefixing Jekyll links with `{{ site.baseurl }}`

Every link to another page or resource within a Jekyll site that starts with
`/` or that is defined using directives such as `{{ post.url }}` _must_ be
prefixed with `{{ site.baseurl }}`. The `18f-pages-server` depends on this
property to ensure that your site may be published correctly on the host as
`https://PAGES_HOST/REPO_NAME/`, as explained in the
[additional server-generated Jekyll configuration](#generated-config) section.
This is exactly analogous to the
[GitHub Project Pages URL structure](https://jekyllrb.com/docs/github-pages/#project-page-url-structure).

For example:

```markdown
[This link will be broken when published.](/another/page)
[This link will continue to work.]({{ site.baseurl }}/another/page)
```

With `{{ site.baseurl }}` applied to every link that needs it, your site will
render properly and behave identically when served locally at
http://localhost:4000/ via `jekyll serve` _and_ when published to
`https://PAGES_HOST/REPO_NAME/`.

### Repository configuration

In the following instructions, `18f-pages` is the name of the publishing
branch. This name is configurable for each `builders` entry in the
[`pages-config.json`](#pages-config) file.

- Create the `18f-pages` publishing branch. If you already have a `gh-pages`
  branch, you can do this on the command line via:
```sh
$ git checkout -b 18f-pages gh-pages
$ git push origin 18f-pages
```
- If your repo is primarily an 18F Pages site (as opposed to a project site
  with an `18f-pages` branch for documentation), you may optionally set the
  default branch on GitHub to `18f-pages`.
- Configure a [webhook](#webhook) for the repository if there isn't already
  a webhook configured for the entire GitHub organization.
- Push a change to the `18f-pages` branch to publish your site.

### New sites are not published before the first push to the publishing branch

The server currently does not detect the creation of a publishing branch (e.g.
`18f-pages`), or the creation of a repository with a publishing branch.
Therefore, one must push a change to a publishing branch before the site will
appear on the serving host. It is unclear whether we will implement detection
of new repositories or publishing branches in the future.

### Multiple publishing branches

A repository can contain more than one publishing branch, with each branch
corresponding to a `builders` item in the [`pages-config.json`
file](#pages-config).

Several 18F repositories have both an `18f-pages` and an `18f-pages-staging`
branch, with the idea that most changes will be applied first to
`18f-pages-staging` and published at https://pages-staging.18f.gov/. When the
site is ready for public release, the `18f-pages-staging` branch will be
merged into `18f-pages`, publishing the site at https://pages.18f.gov/.

### <a name="internal-external"></a>Publishing to internal and external sites from the same branch

It is possible to configure your site to publish to both an _internal_ site
and an _external_ site from the same branch.

- Add a `_config_internal.yml` file to your Jekyll site containing the
  configuration needed to filter out internal-only content. For example, your
  internal-only content may be wrapped using the following
  [Liquid conditional](https://github.com/Shopify/liquid/wiki/Liquid-for-Designers):<br/>
  <pre>
  {% if site.internal %}REDACTED TO PROTECT THE INNOCENT AND THEIR VICTIMS{% endif %}
  </pre>
  Then, your `_config_internal.yml` should contain the property:
  <pre>
  internal: true
  </pre>
  However, you're free to implement any filtering and configuration scheme
  that makes sense for your site.
- Add a [`internalSiteDir` attribute to one of the `builders` in your
  configuration](#pages-config). The internal version of your site will be
  generated in this directory, and the external version will be generated into
  the `generatedSiteDir` directory for the `builder`.
- Configure your web server to serve from `internalSiteDir` and
  `generatedSiteDir` from two different virtual hosts. Configure the
  `internalSiteDir` host to provide authenticated access. For an example, see
  the [18F Pages Nginx configuration for https://pages-internal.18f.gov/](https://github.com/18F/hub/blob/master/deploy/etc/nginx/vhosts/pages.conf).

You may also add a `_config_external.yml` file for additional configuration,
but a `_config_internal.yml` file must still be present.

If you need a site to remain internal-only, set up a separate [`builders`
entry in the configuration](#pages-config) for an internal-only branch.

### <a name="webhook"></a>Webhook configuration

You will need to configure one or more
[GitHub webhooks](https://developer.github.com/webhooks/) to send `push`
events to `https://PAGES_HOST/deploy`, where `PAGES_HOST` is the hostname for
your organization's instance of the pages server, e.g. `pages.18f.gov`.  The
webhooks must be of **Content type `application/json`**.  Webhooks can be
configured for individual repositories, or a single webhook can be configured
for an entire GitHub organization. See the [18F Guides Template webhook setup
instructions](https://pages.18f.gov/guides-template/post-your-guide/#set-webhook)
for an example.

### Stale sites and repositories require manual deletion

There is currently no facility for automatically deleting stale repositories
or the sites generated by them when a repository or its publishing branch is
renamed or deleted, or when a site updates its own `baseurl` via its own
[`pagesYaml` file](#generated-config). For the time being, such repositories
and generated site directories must be removed from the host manually. We may
implement automated site and repository removal in the future.

### <a name="generated-config"></a>Additional server-generated Jekyll configuration

For Jekyll sites, the server will generate a temporary Jekyll config file with
a name defined by the `pagesConfig` [configuration property](#pages-config).
For 18F Pages, this file is called `_config_18f_pages.yml`. It will define the
following values that will override any existing values from the site's
`_config.yml` file:

* **baseurl:** - set to the name of the repository without the organization
  prefix, e.g. `/guides-template` for the `18F/guides-template` repo
* **asset_root:** - set to the `assetRoot` [configuration
  property](#pages-config)

**In most cases, published sites should not have either of these properties
defined in their `_config.yml` files, nor should they publish their own
`_config_18f_pages.yml` file.** However, if a site does contain its own
`_config_18f_pages.yml` file, the server will use settings from that file
rather than generating its own.

If a site uses this file to define its own `baseurl` property, and that
property is not `/` or the empty string, then the generated output directory
will match the defined `baseurl`. In this case, `baseurl` _must_ begin with
`/`.

If `baseurl` is `/` or the empty string, or is not defined in the file, the
generated output directory will match the default for any other site, which is
the repository name without the organization prefix. See the section on
[creating a symlink to the generated homepage](#homepage-symlink) for details
about this use case.

## <a name="installation"></a>Installing the `18f-pages` server

Install the following if they are not yet present on your system:

* [Node.js](https://nodejs.org/) version 0.12.7 or higher;
  check with `node -v`
* [Ruby](https://www.ruby-lang.org/) version 2.2.3 or higher;
  check with `ruby -v`
* [Git](https://git-scm.com/) version 1.9.1 or higher;
  check with `git --version`

For Ruby, we strongly recommend using a version manager such as
[rbenv](https://github.com/sstephenson/rbenv) or [rvm](https://rvm.io/),
though this is not required.

`rsync` should already be installed on most UNIX-like systems, but the
`rsyncOpts` [configuration option](#pages-config) may require adjustment,
particularly on OS X. You may wish to experiment with `rsync` manually to
determine which options suit you best.

With the correct Node.js, Ruby, and Git versions in place, run the following:

```sh
$ gem install jekyll bundler
$ npm install -g 18f-pages-server forever
```

Finally, as the user on the host that will run the server,
[generate an SSH key to add to your GitHub
account](https://help.github.com/articles/generating-ssh-keys/). A new key can
be generated by another team member should you leave the organization.

### <a name="pages-config"></a>Generate and configure `pages-config.json`

Run `18f-pages print-template > path/to/pages-config.json` to generate a
`pages-config.json` file. Edit this file to support your installation.

The template is a copy of the [`pages-config.json`](./pages-config.json) from
this repository, which is based on the actual configuration for 18F Pages, and
illustrates each of the following settings:

* **port**: the port on which the server will listen for GitHub webhooks
* **home**: the parent directory for all of the generated site content
* **git**:  path to `git` on the host machine
* **bundler**: path to `bundle` on the host machine
* **bundlerCacheDir**: path to bundle cache relative to **home**
* **jekyll**:  path to `jekyll` on the host machine
* **rsync**: path to `rsync` on the host machine
* **rsyncOpts**: options to pass to `rsync` that control Jekyll-less builds;
  OS X installations in particular may need to adjust these
* **s3 (optional)**: if present, will back up each generated site to
  [Amazon S3](https://aws.amazon.com/s3/); attributes are:
  * **awscli**: path to the [`aws` command](https://aws.amazon.com/cli/) on
    the host machine
  * **bucket**: address of the S3 bucket to which to sync generated sites
* **payloadLimit**: maximum allowable size (in bytes) for incoming webhooks
* **githubOrg**: GitHub organization to which all published repositories
  belong
* **pagesConfig**: name of the [server-generated Jekyll config file](#generated-config)
  that sets the `baseurl:` and `asset_root:` Jekyll properties
* **pagesYaml**: name of the file from which properties such as `baseurl:`
  will be read
* **fileLockWaitTime**: max time for an incoming build request to wait for the
  lock file, in milliseconds
* **fileLockPollTime**: max interval for an incoming build request to poll for
  the lock file, in milliseconds
* **secretKeyFile (optional)**: if you defined a **Secret** for your webhook,
  you must enter the path to a file containing the secret value; otherwise
  ignore this
* **assetRoot**: the value that the generated `pagesConfig` file will contain
  for the `asset_root:` Jekyll configuration variable; see the
  [`guides_style_18f` gem's source code](https://github.com/18F/guides-style)
  for how 18F Pages share common style sheets and JavaScript files across 18F
  Pages sites, so that updates to the theme are shared across all 18F Pages
  once they are pushed to the
  [18F Guides Template](https://pages.18f.gov/guides-template/)
* **builders**: a list of individual webhook listeners/document publishers;
  each item contains the following fields, _each of which must contain a
  unique value relative to all other `builders` entries_:
  * **branch**: the publishing branch from which to generate sites
  * **repositoryDir**: the directory within **home** into which all repositories
    will be cloned
  * **generatedSiteDir**: the directory within **home** into which all sites
    will be generated
  * **internalSiteDir**: the directory within **home** into which internal views
    of sites will be generated

Also, each `builders` entry may override one or more of the following
top-level values:

* **githubOrg**
* **pagesConfig**
* **pagesYaml**
* **secretKeyFile**
* **assetRoot**

The `builders` list allows us to run one server to publish both
https://pages.18f.gov/ and the authenticated https://pages-staging.18f.gov/.

#### Branch-specific secret keys

The value within the top-level `secretKeyFile` will be used to validate all
incoming payloads across all branches by default. However, it is possible to
configure branch-specific `secretKeyFile` values, if the payloads
corresponding to a particular branch are generated by an additional webhook.

For example, if you want to run one Pages server for more than one GitHub
organization, rather than sharing secret keys across organizations, each
organization will have its own branch with its own `secretKeyFile`.

### Run the `18f-pages` server

After that, run the following to launch the server via
[Forever](https://www.npmjs.com/package/forever), where `/path/to/` and
`/usr/local/bin/` are replaced with the appropriate absolute paths:

```sh
$ forever start -l /path/to/pages.log -a /usr/local/bin/18f-pages /path/to/pages-config.json
```

You can find the absolute path to `18f-pages` by running `which 18f-pages`.

### <a name="homepage-symlink"></a>Create a symlink to the `index.html` of the generated homepage

Follow this example if you wish to publish the homepage of your
`18f-pages-server` host using `18f-pages-server` as well.

The [18F Pages homepage](https://pages.18f.gov/) is itself built from the
[18F/pages](https://github.com/18F/pages/) repository. It defines its own
[`_config_18f_pages.yml`](https://github.com/18F/pages/blob/18f-pages/_config_18f_pages.yml)
file so that the `baseurl:` override described in the
[additional server-generated Jekyll configuration](#generated-config) section
does not take place:

```yaml
baseurl:
asset_root: /guides-template
```

The homepage is _literally_ a one-page site, but it is still published into a
directory called `pages`. The trick to having it appear at the root of
https://pages.18f.gov/ is to manually
[symlink](https://en.wikipedia.org/wiki/Symbolic_link) `pages/index.html` into
its parent directory:

```sh
$ ln -s /home/ubuntu/pages-generated/pages/index.html /home/ubuntu/pages-generated/index.html
```

This symlink-based solution results in the homepage also remaining available
at https://pages.18f.gov/pages/, but that hardly seems worth fixing. If
avoiding this is a priority for your organization, the homepage can be
generated using its own dedicated `builder` and served via its own dedicated
webserver rule. Trying to automate generation of the symlink or to copy the
generated homepage file might be another option, but seems riskier and
potentially esoteric.

### Webserver configuration

The final _required_ step is setting up your webserver to expose the `18f-pages`
webhook endpoint and to serve the static content generated by the `18f-pages`
server. The final _optional_ step is setting up an organization-wide
[webhook](#webhook) once the webserver is configured and running.

The following excerpts are extracted from the complete
[18F Pages nginx configuration](https://github.com/18F/hub/blob/master/deploy/etc/nginx/vhosts/pages.conf)
for https://pages.18f.gov/ and https://pages-staging.18f.gov/. Note how the
values match those from the [`pages-config.json` file](./pages-config.json),
explained in the [configuration section](#pages-config).

This first excerpt from the https://pages.18f.gov/ `server` block defines the
`https://pages.18f.gov/deploy` webhook endpoint. This endpoint proxies
requests to the `18f-pages` server running on port 5000. Note that only one
webhook endpoint is required, since the single server instance publishes both
https://pages.18f.gov/ and https://pages-staging.18f.gov/.
```
server {
  listen 443 ssl spdy;
  server_name  pages.18f.gov;
  include ssl/star.18f.gov.conf;

  ...

  location /deploy {
    proxy_pass http://localhost:5000/;
    proxy_http_version 1.1;
    proxy_redirect off;

    proxy_set_header Host   $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_max_temp_file_size 0;

    proxy_connect_timeout 10;
    proxy_send_timeout    30;
    proxy_read_timeout    30;
  }

  ...
}
```

This second excerpt from the https://pages.18f.gov/ `server` block corresponds
to the first `builders` entry from [`pages-config.json`](./pages-config.json):
```
server {
  listen 443 ssl spdy;
  server_name  pages.18f.gov;
  include ssl/star.18f.gov.conf;

  ...

  location / {
    root   /home/ubuntu/pages-generated;
    index  index.html;
    default_type text/html;
  }

  ...
}
```

These final `server` blocks define the authenticated
https://pages-staging.18f.gov/ host. The `127.0.0.1:8080` block corresponds to
the second `builders` entry from [`pages-config.json`](./pages-config.json).
Note that this site uses the
[bitly/oauth2_proxy](https://github.com/18F/oauth2_proxy/) for authentication,
which you can learn more about in the [OAuth2 Proxy section of the 18F Hub
deployment README](https://github.com/18F/hub/tree/master/deploy#oauth2-proxy).
```
server {
  listen 443 ssl spdy;
  server_name  pages-staging.18f.gov;
  include ssl/star.18f.gov.conf;

  include vhosts/auth-locations.conf;
}

server {
  listen 127.0.0.1:8080;
  server_name  pages-staging.18f.gov;
  port_in_redirect off;

  location / {
    root  /home/ubuntu/pages-staging;
    index  index.html;
    default_type text/html;
  }
}
```

## Contributing

1. Fork the repo (or just clone it if you're an 18F team member)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Make your changes and test them via `npm test` or `gulp test`
4. Lint your changes with `gulp lint`
5. Commit your changes (`git commit -am 'Add some feature'`)
6. Push to the branch (`git push origin my-new-feature`)
7. Create a new Pull Request

Feel free to [file an issue](https://github.com/18F/pages-server/issues) or to
ping @ertzeid, @jbarnicle, or @mtorres253 with any questions you may have,
especially if the current documentation should've addressed your needs, but
didn't.

## Public domain

This project is in the worldwide [public domain](LICENSE.md). As stated in
[CONTRIBUTING](CONTRIBUTING.md):

> This project is in the public domain within the United States, and copyright
> and related rights in the work worldwide are waived through the
> [CC0 1.0 Universal public domain dedication](https://creativecommons.org/publicdomain/zero/1.0/).
>
> All contributions to this project will be released under the CC0 dedication.
> By submitting a pull request, you are agreeing to comply with this waiver of
> copyright interest.
