# 18f-pages-server

This is the server that publishes the static websites for
[18F Pages](https://pages.18f.gov/). It works very similarly to
[GitHub pages](https://pages.github.com/). It automatically publishes
[Jekyll](http://jekyllrb.com/)-based web sites whenever updates are made to
a publishing branch (like `gh-pages`, but where the name of the branch is
defined by the server's configuration). It also supports publishing via
[`rsync`](https://rsync.samba.org/) if the publishing branch does not contain
a Jekyll-based site.

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
running `18f-pages-server` and `REPO_NAME` is the name of the repository minus
the organization name.

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
branch. This name is configurable for each `builders:` entry in the
[`pages-config.json`](#pages-config) file.

- Create the `18f-pages` publishing branch. If you already have a `gh-pages`
  branch, you can do this on the command line via:
```sh
$ git checkout -b 18f-pages gh-pages
$ git push origin 18f-pages
```
- If your repo is primarily an `18f-pages-server` site (as opposed to a
  project site with an `18f-pages` branch for documentation), you may
  optionally set the default branch on GitHub to `18f-pages`.
- Configure a [webhook](#webhook) for the repository if there isn't already
  a webhook configured for the entire GitHub organization.
- Push a change to the `18f-pages` branch to publish your site.

### <a name="webhook"></a>Webhook configuration

You will need to configure one or more
[GitHub webhooks](https://developer.github.com/webhooks/) to send `push`
events to `https://PAGES_HOST/deploy`, where `PAGES_HOST` is the hostname for
your organization's instance of the pages server, e.g. `pages.18f.gov`.
Webhooks can be configured for individual repositories, or a single webhook
can be configured for an entire GitHub organization. See the
[18F Guides Template webhook setup instructions](https://pages.18f.gov/guides-template/post-your-guide/#set-webhook)
for an example.

### <a name="generated-config"></a>Additional server-generated Jekyll configuration

For Jekyll sites, the server will generate a temporary Jekyll config file with
a name defined by the `pagesConfig:` [configuration property](#pages-config).
For 18F Pages, this file is called `_config_18f_pages.yml`. It will define the
following values that will override any existing values from the site's
`_config.yml` file:

* `baseurl:` - set to the name of the repository minus the organization name,
  e.g. `guides-template` for the `18F/guides-template` repo
* `asset_root:` - set to the `assetRoot:` configuration property

In most cases, published sites should not have either of these properties
defined in their `_config.yml` files, nor should they publish their own
`_config_18f_pages.yml` file. However, if a site does contain its own
`_config_18f_pages.yml` file, the server will use settings from that file
rather than generating its own.

If a site uses this file to define its own `baseurl` property, and that
property is not `/` or the empty string, then the generated output directory
will match the defined `baseurl`. In this case, `baseurl` _must_ begin with
`/`.

If `baseurl` is `/` or the empty string, or is not defined in the file, the
generated output directory will match the default for any other site, which is
the repository name minus the organization prefix. See the section on
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

### Generate and configure <a name="pages-config"></a>`pages-config.json`

Run `18f-pages print-template > path/to/pages-config.json` to generate a
`pages-config.json` file. Edit this file to support your installation.

The [`pages-config.json`](./pages-config.json) from this repository is based
on the actual configuration for 18F Pages, and illustrates each of the
following settings:

* **port**: the port on which the server will listen for GitHub webhooks
* **home**: the parent directory for all of the `repositoryDir` and
  `generatedSiteDir` directories created by the `builders`
* **git**:  path to `git` on the host machine
* **bundler**: path to `bundle` on the host machine
* **jekyll**:  path to `jekyll` on the host machine
* **rsync**: path to `rsync` on the host machine
* **rsyncOpts**: options to pass to `rsync` that control Jekyll-less builds
* **payloadLimit**: maximum allowable size (in bytes) for incoming webhooks
* **githubOrg**: GitHub organization to which all published repositories
  belong
* **pagesConfig**: name of the [server-generated Jekyll config file](#generated-config)
  that sets the `baseurl:` and `asset_root:` Jekyll properties
* **fileLockWaitTime**: max time for an incoming build request to wait for the
  lock file, in milliseconds
* **fileLockPollTime**: max interval for an incoming build request to poll for
  the lock file, in milliseconds
* **assetRoot**: the value that the **pagesConfig** will contain for the
  `asset_root:` configuration variable; see the [`guides_style_18f` gem's source
  code](https://github.com/18F/guides-style) for how 18F Pages share common
  style sheets and JavaScript files across 18F Pages sites, so that updates to
  the theme are shared across all 18F Pages once they are pushed to the [18F
  Guides Template](https://pages.18f.gov/guides-template/)
* **builders**: a list of individual webhook listeners/document publishers;
  each item contains:
  * **branch**: the publishing branch from which to generate sites
  * **repositoryDir**: the directory on the host machine into which all
    repositories will be cloned
  * **generatedSiteDir**: the directory on the host machine into which all
    sites will be generated

The **builders** list allows us to run one server to publish both
https://pages.18f.gov/ and the authenticated https://pages-staging.18f.gov/.

### Run the `18f-pages` server

After that, run the following to launch the server via
[Forever](https://www.npmjs.com/package/forever), where `/path/to/` and
`/usr/local/bin/` are replaced with the appropriate absolute paths:

```sh
$ forever start -l /path/to/pages.log -a \
  /usr/local/bin/18f-pages /path/to/pages-config.json
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
$ ln -s /home/ubuntu/pages-generated/pages/index.html \
  /home/ubuntu/pages-generated/index.html
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
[webhook](#webhooks) once the webserver is configured and running.

The following excerpts are extracted from the complete
[18F Pages nginx configuration](https://github.com/18F/hub/blob/master/deploy/etc/nginx/vhosts/pages.conf)
for https://pages.18f.gov/ and https://pages-staging.18f.gov/. Note how the
values match those from the [`pages-config.json` file](./pages-config.json),
explained in the [configuration section](#pages-config).

The https://pages.18f.gov/deploy webhook endpoint that proxies to the
`18f-pages` server running on port 5000:
```
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
```

The https://pages.18f.gov/ server for the first `builders` entry:
```
location / {
  root   /home/ubuntu/pages-generated;
  index  index.html;
  default_type text/html;
}
```

The https://pages-staging.18f.gov/ server for the second `builders` entry:
```
location / {
  alias  /home/ubuntu/pages-staging/;
  index  index.html;
  default_type text/html;
}
```

## Other administration details

There is current no facility for automatically deleting stale repositories or
the sites generated by them when a repository or its publishing branch is
renamed or deleted, or when a site updates its own `baseurl` via its own
[`pagesConfig` file](#generated-config). For the time being, such repositories
and generated site directories must be removed manually. We may add this
functionality in the future.

## Contributing

1. Fork the repo (or just clone it if you're an 18F team member)
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Make your changes and test them via `npm test` or `gulp test`
4. Lint your changes with `gulp lint`
5. Commit your changes (`git commit -am 'Add some feature'`)
6. Push to the branch (`git push origin my-new-feature`)
7. Create a new Pull Request

Feel free to ping [@mbland](https://github.com/mbland) with any questions you
may have, especially if the current documentation should've addressed your
needs, but didn't.

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
