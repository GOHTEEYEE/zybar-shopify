/**
 * Visual Journey Builder (vanilla canvas).
 * Decoupled from the Journey Engine — only maps UI nodes ↔ journey API payloads.
 *
 * Node graph shape is React-Flow-ready:
 *   { nodes: [{ id, type, data }], edges: [{ id, source, target }] }
 * Phase 1 renders a vertical linear timeline only.
 */
(function (global) {
  'use strict';

  var ACTION_NODE_TYPES = ['email', 'whatsapp', 'sms', 'webhook', 'crm_task', 'ai_action'];
  var ADDABLE_TYPES = [
    { type: 'wait', label: 'Wait', icon: '⏱', phase1: true },
    { type: 'email', label: 'Email', icon: '📧', phase1: true },
    { type: 'whatsapp', label: 'WhatsApp', icon: '💬', phase1: false },
    { type: 'sms', label: 'SMS', icon: '📱', phase1: false },
    { type: 'condition', label: 'Condition', icon: '◆', phase1: false },
    { type: 'webhook', label: 'Webhook', icon: '🔗', phase1: false },
    { type: 'tag', label: 'Tag', icon: '🏷', phase1: false },
    { type: 'end', label: 'End', icon: '⏹', phase1: false }
  ];

  function uid(prefix) {
    return (prefix || 'n') + '_' + Math.random().toString(36).slice(2, 9);
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function when(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  }

  function templateName(templates, key) {
    if (!key) return 'No template';
    for (var i = 0; i < templates.length; i++) {
      if (templates[i].key === key) return templates[i].name;
    }
    return key;
  }

  function triggerLabel(t) {
    var map = {
      signup: 'Signup',
      add_to_cart: 'Add To Cart',
      purchase: 'Purchase',
      no_purchase: 'No Purchase (Legacy)',
      no_purchase_90_days: '90 Days No Purchase',
      manual: 'Manual'
    };
    return map[t] || t;
  }

  function delaySummary(value, unit) {
    var n = Number(value) || 0;
    if (n === 0) return 'Immediately';
    var u = unit || 'minutes';
    var label = u;
    if (n === 1 && u.charAt(u.length - 1) === 's') label = u.slice(0, -1);
    return n + ' ' + label.charAt(0).toUpperCase() + label.slice(1);
  }

  function nodeMeta(type) {
    var map = {
      trigger: { icon: '⚡', title: 'Trigger', tone: 'trigger' },
      wait: { icon: '⏱', title: 'Wait', tone: 'wait' },
      email: { icon: '📧', title: 'Email', tone: 'email' },
      whatsapp: { icon: '💬', title: 'WhatsApp', tone: 'future' },
      sms: { icon: '📱', title: 'SMS', tone: 'future' },
      webhook: { icon: '🔗', title: 'Webhook', tone: 'future' },
      condition: { icon: '◆', title: 'Condition', tone: 'future' },
      tag: { icon: '🏷', title: 'Tag', tone: 'future' },
      end: { icon: '⏹', title: 'End', tone: 'end' },
      crm_task: { icon: '📋', title: 'CRM Task', tone: 'future' },
      ai_action: { icon: '✨', title: 'AI Action', tone: 'future' }
    };
    return map[type] || { icon: '○', title: type, tone: 'future' };
  }

  function isActionType(type) {
    return ACTION_NODE_TYPES.indexOf(type) !== -1;
  }

  /** Expand API steps into visual Wait + Action nodes (linear). */
  function stepsToGraph(journey, steps) {
    var nodes = [];
    var edges = [];
    var triggerId = 'trigger';
    nodes.push({
      id: triggerId,
      type: 'trigger',
      data: {
        trigger_type: (journey && journey.trigger_type) || 'signup',
        label: triggerLabel((journey && journey.trigger_type) || 'signup')
      }
    });
    var prev = triggerId;
    var list = steps && steps.length ? steps : [];
    list.forEach(function (step, index) {
      var waitId = uid('wait');
      var actionType = step.action_type || 'email';
      var actionId = uid(actionType);
      nodes.push({
        id: waitId,
        type: 'wait',
        data: {
          delay_value: step.delay_value || 0,
          delay_unit: step.delay_unit || 'minutes',
          step_order: step.step_order || index + 1
        }
      });
      edges.push({ id: uid('e'), source: prev, target: waitId });
      nodes.push({
        id: actionId,
        type: actionType,
        data: {
          step_name: step.step_name || 'Step ' + (index + 1),
          template_id: step.template_id || '',
          action_type: actionType,
          step_order: step.step_order || index + 1
        }
      });
      edges.push({ id: uid('e'), source: waitId, target: actionId });
      prev = actionId;
    });
    return { nodes: nodes, edges: edges };
  }

  /** Collapse linear visual nodes back into journey_steps for the API. */
  function graphToSteps(nodes) {
    var flow = nodes.filter(function (n) {
      return n.type !== 'trigger';
    });
    var steps = [];
    var i = 0;
    while (i < flow.length) {
      var delay_value = 0;
      var delay_unit = 'minutes';
      var step_name = 'Step';
      var action_type = 'email';
      var template_id = null;

      if (flow[i].type === 'wait') {
        delay_value = Math.max(0, Number(flow[i].data.delay_value) || 0);
        delay_unit = flow[i].data.delay_unit || 'minutes';
        i += 1;
      }

      if (i < flow.length && (isActionType(flow[i].type) || flow[i].type === 'end' || flow[i].type === 'condition' || flow[i].type === 'tag')) {
        var action = flow[i];
        if (action.type === 'end' || action.type === 'condition' || action.type === 'tag') {
          // Persist as email placeholder for Phase 1 schema compatibility
          action_type = 'email';
          step_name = action.data.step_name || nodeMeta(action.type).title;
          template_id = action.data.template_id || null;
        } else {
          action_type = action.type === 'crm_task' || action.type === 'ai_action' ? action.type : action.type;
          if (['whatsapp', 'sms', 'webhook'].indexOf(action.type) !== -1) {
            action_type = action.type;
          }
          step_name = action.data.step_name || nodeMeta(action.type).title;
          template_id = action.data.template_id || null;
        }
        // Map unsupported Phase-1 action types to email for DB check, keep name
        if (['condition', 'tag', 'end'].indexOf(action.type) !== -1) {
          action_type = 'email';
        }
        i += 1;
      } else {
        // Wait-only → persist as wait with email action and no template
        step_name = 'Wait';
        action_type = 'email';
        template_id = null;
      }

      // DB only allows certain action types
      var allowed = ['email', 'whatsapp', 'sms', 'crm_task', 'webhook', 'ai_action'];
      if (allowed.indexOf(action_type) === -1) action_type = 'email';

      steps.push({
        step_order: steps.length + 1,
        step_name: step_name,
        delay_value: delay_value,
        delay_unit: delay_unit,
        action_type: action_type,
        template_id: template_id
      });
    }
    return steps;
  }

  function nodeSummary(node, templates) {
    if (node.type === 'trigger') return triggerLabel(node.data.trigger_type);
    if (node.type === 'wait') return delaySummary(node.data.delay_value, node.data.delay_unit);
    if (node.type === 'email') return templateName(templates, node.data.template_id);
    if (node.type === 'condition') return node.data.label || 'If / else';
    if (node.type === 'end') return 'Journey ends';
    if (node.type === 'tag') return node.data.tag || 'Add tag';
    if (node.type === 'webhook') return node.data.url || 'Webhook URL';
    return node.data.step_name || nodeMeta(node.type).title;
  }

  function defaultNodeData(type, templates) {
    if (type === 'wait') return { delay_value: 1, delay_unit: 'days' };
    if (type === 'email') {
      return {
        step_name: 'Email',
        template_id: templates[0] ? templates[0].key : '',
        action_type: 'email'
      };
    }
    if (type === 'whatsapp' || type === 'sms') {
      return { step_name: nodeMeta(type).title, template_id: '', action_type: type };
    }
    if (type === 'webhook') return { step_name: 'Webhook', url: '', action_type: 'webhook' };
    if (type === 'condition') return { step_name: 'Condition', label: 'If / else' };
    if (type === 'tag') return { step_name: 'Tag', tag: '' };
    if (type === 'end') return { step_name: 'End' };
    return { step_name: nodeMeta(type).title };
  }

  /**
   * Mount the visual builder into `host`.
   * @param {HTMLElement} host
   * @param {object} options
   */
  function mount(host, options) {
    options = options || {};
    var templates = options.templates || [];
    var triggerTypes = options.trigger_types || [
      'signup',
      'add_to_cart',
      'purchase',
      'no_purchase_90_days',
      'manual'
    ];
    var journeyOptions = options.journey_options || [];
    var delayUnits = options.delay_units || ['minutes', 'hours', 'days', 'weeks'];
    var activeLeads = options.active_leads || [];
    var analytics = options.analytics || { enrollments: {}, queue: {} };
    var history = options.history || [];
    var journey = options.journey || null;
    var isNew = !journey || !journey.id;

    var graph = stepsToGraph(journey, (journey && journey.steps) || []);
    if (!isNew && (!journey.steps || !journey.steps.length)) {
      // keep trigger only
    } else if (isNew && graph.nodes.length === 1) {
      // starter: Wait 5m + Welcome email
      var w = uid('wait');
      var e = uid('email');
      graph.nodes.push({
        id: w,
        type: 'wait',
        data: { delay_value: 5, delay_unit: 'minutes' }
      });
      graph.nodes.push({
        id: e,
        type: 'email',
        data: {
          step_name: 'Welcome',
          template_id: templates[0] ? templates[0].key : 'welcome_email',
          action_type: 'email'
        }
      });
      graph.edges.push({ id: uid('e'), source: 'trigger', target: w });
      graph.edges.push({ id: uid('e'), source: w, target: e });
    }

    var state = {
      id: journey && journey.id ? journey.id : null,
      name: journey && journey.name ? journey.name : '',
      description: journey && journey.description ? journey.description : '',
      is_active: journey ? !!journey.is_active : false,
      status:
        journey && journey.status
          ? journey.status
          : journey && journey.is_active
            ? 'published'
            : 'draft',
      trigger_type: journey && journey.trigger_type ? journey.trigger_type : 'signup',
      exit_trigger: journey && journey.exit_trigger ? journey.exit_trigger : '',
      next_journey_id:
        journey && journey.next_journey_id ? journey.next_journey_id : '',
      exit_behavior:
        journey && journey.exit_behavior === 'cancelled' ? 'cancelled' : 'completed',
      nodes: graph.nodes,
      edges: graph.edges,
      selectedId: null,
      addMenuAfter: null,
      dirty: false,
      saving: false
    };

    // Sync trigger node with header trigger
    function syncTriggerNode() {
      state.nodes.forEach(function (n) {
        if (n.type === 'trigger') {
          n.data.trigger_type = state.trigger_type;
          n.data.label = triggerLabel(state.trigger_type);
        }
      });
    }

    function orderedNodes() {
      // Linear walk via edges from trigger
      var byId = {};
      state.nodes.forEach(function (n) {
        byId[n.id] = n;
      });
      var nextOf = {};
      state.edges.forEach(function (e) {
        nextOf[e.source] = e.target;
      });
      var order = [];
      var cur = 'trigger';
      var guard = 0;
      while (cur && byId[cur] && guard < 200) {
        order.push(byId[cur]);
        cur = nextOf[cur];
        guard += 1;
      }
      // orphans
      state.nodes.forEach(function (n) {
        if (
          !order.some(function (o) {
            return o.id === n.id;
          })
        ) {
          order.push(n);
        }
      });
      return order;
    }

    function rebuildEdgesFromOrder(order) {
      var edges = [];
      for (var i = 0; i < order.length - 1; i++) {
        edges.push({
          id: uid('e'),
          source: order[i].id,
          target: order[i + 1].id
        });
      }
      state.edges = edges;
      state.nodes = order.slice();
    }

    function insertAfter(afterId, type) {
      var order = orderedNodes();
      var idx = -1;
      for (var i = 0; i < order.length; i++) {
        if (order[i].id === afterId) {
          idx = i;
          break;
        }
      }
      if (idx < 0) idx = order.length - 1;
      var node = {
        id: uid(type),
        type: type,
        data: defaultNodeData(type, templates)
      };
      order.splice(idx + 1, 0, node);
      rebuildEdgesFromOrder(order);
      state.selectedId = node.id;
      state.addMenuAfter = null;
      state.dirty = true;
      paint();
      openDrawer(node.id);
    }

    function duplicateNode(nodeId) {
      var order = orderedNodes();
      var idx = -1;
      for (var i = 0; i < order.length; i++) {
        if (order[i].id === nodeId) {
          idx = i;
          break;
        }
      }
      if (idx < 0 || order[idx].type === 'trigger') return;
      var src = order[idx];
      var copy = {
        id: uid(src.type),
        type: src.type,
        data: JSON.parse(JSON.stringify(src.data))
      };
      if (copy.data.step_name) copy.data.step_name = copy.data.step_name + ' (Copy)';
      order.splice(idx + 1, 0, copy);
      rebuildEdgesFromOrder(order);
      state.selectedId = copy.id;
      state.dirty = true;
      paint();
    }

    function deleteNode(nodeId) {
      var order = orderedNodes().filter(function (n) {
        return n.id !== nodeId && n.type !== undefined;
      });
      // Keep trigger
      if (
        !order.some(function (n) {
          return n.type === 'trigger';
        })
      ) {
        return;
      }
      if (order.length <= 1) {
        alert('Add at least one step after the trigger.');
        return;
      }
      rebuildEdgesFromOrder(order);
      if (state.selectedId === nodeId) state.selectedId = null;
      state.dirty = true;
      paint();
    }

    function findNode(id) {
      for (var i = 0; i < state.nodes.length; i++) {
        if (state.nodes[i].id === id) return state.nodes[i];
      }
      return null;
    }

    function openDrawer(nodeId) {
      state.selectedId = nodeId;
      paint();
    }

    function closeDrawer() {
      state.selectedId = null;
      paint();
    }

    function statusPill(status) {
      var s = String(status || '').toLowerCase();
      var cls = 'admin-workflow-pill admin-workflow-pill-status';
      if (s === 'waiting') cls += ' admin-journey-pill-wait';
      else if (s === 'ready') cls += ' admin-journey-pill-due';
      else if (s === 'completed' || s === 'cancelled') cls += ' admin-journey-pill-cyan';
      else cls += ' admin-journey-pill-off';
      return '<span class="' + cls + '">' + esc(s) + '</span>';
    }

    function renderAddMenu(afterId) {
      return (
        '<div class="jb-add-menu" data-after="' +
        esc(afterId) +
        '">' +
        ADDABLE_TYPES.map(function (item) {
          return (
            '<button type="button" class="jb-add-menu-item' +
            (item.phase1 ? '' : ' is-future') +
            '" data-type="' +
            esc(item.type) +
            '"' +
            (item.phase1 ? '' : ' title="Designed for future support"') +
            '>' +
            '<span class="jb-add-menu-icon">' +
            item.icon +
            '</span>' +
            '<span>' +
            esc(item.label) +
            '</span>' +
            (item.phase1 ? '' : '<em>Soon</em>') +
            '</button>'
          );
        }).join('') +
        '</div>'
      );
    }

    function renderNodeCard(node) {
      var meta = nodeMeta(node.type);
      var selected = state.selectedId === node.id;
      var summary = nodeSummary(node, templates);
      var canDrag = node.type !== 'trigger';
      return (
        '<div class="jb-node jb-node-' +
        esc(meta.tone) +
        (selected ? ' is-selected' : '') +
        '" data-node-id="' +
        esc(node.id) +
        '" data-type="' +
        esc(node.type) +
        '"' +
        (canDrag ? ' draggable="true"' : '') +
        '>' +
        (canDrag ? '<div class="jb-node-handle" title="Drag to reorder">⠿</div>' : '<div class="jb-node-handle jb-node-handle-static"></div>') +
        '<div class="jb-node-icon" aria-hidden="true">' +
        meta.icon +
        '</div>' +
        '<div class="jb-node-body">' +
        '<div class="jb-node-title">' +
        esc(meta.title) +
        '</div>' +
        '<div class="jb-node-summary">' +
        esc(summary) +
        '</div>' +
        '</div>' +
        '<div class="jb-node-actions">' +
        '<button type="button" class="jb-node-btn jb-edit" title="Edit">Edit</button>' +
        (node.type !== 'trigger'
          ? '<button type="button" class="jb-node-btn jb-dup" title="Duplicate">⧉</button>' +
            '<button type="button" class="jb-node-btn jb-del" title="Delete">✕</button>'
          : '') +
        (node.type === 'email'
          ? '<button type="button" class="jb-node-btn jb-preview" title="Preview">Preview</button>'
          : '') +
        '</div></div>'
      );
    }

    function renderConnector(afterId) {
      return (
        '<div class="jb-connector">' +
        '<div class="jb-connector-line"></div>' +
        '<button type="button" class="jb-add-btn" data-after="' +
        esc(afterId) +
        '" title="Add node" aria-label="Add node">+</button>' +
        (state.addMenuAfter === afterId ? renderAddMenu(afterId) : '') +
        '<div class="jb-connector-line"></div>' +
        '</div>'
      );
    }

    function renderDrawer() {
      var node = state.selectedId ? findNode(state.selectedId) : null;
      if (!node) {
        return '<aside class="jb-drawer is-empty"><p class="admin-muted">Select a node to configure it.</p></aside>';
      }
      var meta = nodeMeta(node.type);
      var body = '';

      if (node.type === 'trigger') {
        body =
          '<div class="admin-form-group"><label>Trigger</label><select id="jbDrawerTrigger">' +
          triggerTypes
            .map(function (t) {
              return (
                '<option value="' +
                esc(t) +
                '"' +
                (t === node.data.trigger_type ? ' selected' : '') +
                '>' +
                esc(triggerLabel(t)) +
                '</option>'
              );
            })
            .join('') +
          '</select></div>';
      } else if (node.type === 'wait') {
        body =
          '<div class="admin-form-group"><label>Delay value</label><input type="number" min="0" id="jbDrawerDelay" value="' +
          esc(node.data.delay_value) +
          '" /></div>' +
          '<div class="admin-form-group"><label>Delay unit</label><select id="jbDrawerUnit">' +
          delayUnits
            .map(function (u) {
              return (
                '<option value="' +
                esc(u) +
                '"' +
                (u === node.data.delay_unit ? ' selected' : '') +
                '>' +
                esc(u) +
                '</option>'
              );
            })
            .join('') +
          '</select></div>';
      } else if (node.type === 'email') {
        body =
          '<div class="admin-form-group"><label>Node name</label><input type="text" id="jbDrawerName" value="' +
          esc(node.data.step_name || '') +
          '" /></div>' +
          '<div class="admin-form-group"><label>Template</label><select id="jbDrawerTemplate">' +
          '<option value="">—</option>' +
          templates
            .map(function (t) {
              return (
                '<option value="' +
                esc(t.key) +
                '"' +
                (t.key === node.data.template_id ? ' selected' : '') +
                '>' +
                esc(t.name) +
                '</option>'
              );
            })
            .join('') +
          '</select></div>' +
          '<p class="admin-muted">Use Email Templates to edit HTML. Phase 1 sends via sendEmail().</p>' +
          (node.data.template_id
            ? '<a class="admin-btn-secondary" href="#marketing/templates">Edit templates →</a>'
            : '');
      } else {
        body =
          '<div class="admin-form-group"><label>Node name</label><input type="text" id="jbDrawerName" value="' +
          esc(node.data.step_name || meta.title) +
          '" /></div>' +
          '<p class="jb-future-note">This node type is designed for future support. It can be placed on the canvas now and will map to the action queue later.</p>';
      }

      return (
        '<aside class="jb-drawer">' +
        '<div class="jb-drawer-head">' +
        '<div><span class="jb-drawer-icon">' +
        meta.icon +
        '</span><strong>' +
        esc(meta.title) +
        '</strong></div>' +
        '<button type="button" class="jb-drawer-close" id="jbDrawerClose" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="jb-drawer-body">' +
        body +
        '</div>' +
        '<div class="jb-drawer-foot">' +
        '<button type="button" class="admin-btn-secondary" id="jbDrawerCancel">Cancel</button>' +
        '<button type="button" class="admin-btn-primary" id="jbDrawerSave">Save</button>' +
        '</div></aside>'
      );
    }

    function renderLeads() {
      return (
        '<section class="jb-leads">' +
        '<div class="jb-leads-head"><h3>Active Leads</h3>' +
        '<p class="admin-muted">People currently inside this journey.</p></div>' +
        '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
        '<thead><tr><th>Lead</th><th>Current Node</th><th>Status</th><th>Remaining Time</th><th>Ready Time</th><th>Next Action</th><th></th></tr></thead><tbody>' +
        (activeLeads
          .map(function (r) {
            return (
              '<tr data-lj="' +
              esc(r.id) +
              '"><td>' +
              esc(r.lead_email || '—') +
              '</td><td>' +
              esc(r.current_step) +
              '. ' +
              esc(r.current_step_name || '') +
              '</td><td>' +
              statusPill(r.status) +
              '</td><td>' +
              esc(r.remaining_label) +
              '</td><td>' +
              esc(when(r.next_ready_at)) +
              '</td><td>' +
              esc(
                (r.current_action_type || '') +
                  (r.current_template_id ? ' · ' + r.current_template_id : '')
              ) +
              '</td><td><button type="button" class="admin-btn-secondary jl-cancel">Cancel</button></td></tr>'
            );
          })
          .join('') ||
          '<tr><td colspan="7" class="admin-cell-empty">No active leads in this journey.</td></tr>') +
        '</tbody></table></div></div></section>'
      );
    }

    function renderAnalytics() {
      var enrollments = analytics.enrollments || {};
      var queue = analytics.queue || {};
      return (
        '<section class="jb-leads"><div class="jb-leads-head"><h3>Analytics</h3>' +
        '<p class="admin-muted">Simple workflow health metrics.</p></div>' +
        '<div class="admin-card"><dl class="admin-dl admin-journey-card-meta">' +
        '<div><dt>Active</dt><dd>' +
        esc((enrollments.waiting || 0) + (enrollments.ready || 0)) +
        '</dd></div><div><dt>Completed</dt><dd>' +
        esc(enrollments.completed || 0) +
        '</dd></div><div><dt>Cancelled</dt><dd>' +
        esc(enrollments.cancelled || 0) +
        '</dd></div><div><dt>Queue Pending</dt><dd>' +
        esc(queue.pending || 0) +
        '</dd></div><div><dt>Emails Completed</dt><dd>' +
        esc(queue.completed || 0) +
        '</dd></div><div><dt>Failed</dt><dd>' +
        esc(queue.failed || 0) +
        '</dd></div></dl></div></section>'
      );
    }

    function renderHistory() {
      return (
        '<section class="jb-leads"><div class="jb-leads-head"><h3>History</h3>' +
        '<p class="admin-muted">Recent transitions and queue outcomes for this workflow.</p></div>' +
        '<div class="admin-card"><div class="admin-table-wrap"><table class="admin-table">' +
        '<thead><tr><th>When</th><th>Lead</th><th>Event</th><th>Status</th></tr></thead><tbody>' +
        (history
          .map(function (item) {
            return (
              '<tr><td>' +
              esc(when(item.at)) +
              '</td><td>' +
              esc(item.lead_email || '—') +
              '</td><td>' +
              esc(item.message || item.event_type || '—') +
              '</td><td>' +
              statusPill(item.status) +
              '</td></tr>'
            );
          })
          .join('') ||
          '<tr><td colspan="4" class="admin-cell-empty">No workflow history yet.</td></tr>') +
        '</tbody></table></div></div></section>'
      );
    }

    function paint() {
      syncTriggerNode();
      var order = orderedNodes();
      var canvasHtml = '';
      order.forEach(function (node, index) {
        canvasHtml += renderNodeCard(node);
        canvasHtml += renderConnector(node.id);
      });
      canvasHtml +=
        '<button type="button" class="jb-add-tail" data-after="' +
        esc(order[order.length - 1].id) +
        '">＋ Add Node</button>';

      host.innerHTML =
        '<div class="jb-shell' +
        (state.selectedId ? ' has-drawer' : '') +
        '">' +
        '<header class="jb-header">' +
        '<div class="jb-header-left">' +
        '<a class="jb-back" href="#marketing/journeys">← Journeys</a>' +
        '<input type="text" class="jb-name-input" id="jbHeaderName" placeholder="Journey name" value="' +
        esc(state.name) +
        '" />' +
        '</div>' +
        '<div class="jb-header-meta">' +
        '<label class="jb-header-field">Trigger' +
        '<select id="jbHeaderTrigger">' +
        triggerTypes
          .map(function (t) {
            return (
              '<option value="' +
              esc(t) +
              '"' +
              (t === state.trigger_type ? ' selected' : '') +
              '>' +
              esc(triggerLabel(t)) +
              '</option>'
            );
          })
          .join('') +
        '</select></label>' +
        '<label class="jb-header-field">Exit Trigger' +
        '<select id="jbHeaderExitTrigger"><option value="">None</option>' +
        triggerTypes
          .map(function (t) {
            return (
              '<option value="' +
              esc(t) +
              '"' +
              (t === state.exit_trigger ? ' selected' : '') +
              '>' +
              esc(triggerLabel(t)) +
              '</option>'
            );
          })
          .join('') +
        '</select></label>' +
        '<label class="jb-header-field">Next Journey' +
        '<select id="jbHeaderNextJourney"><option value="">None</option>' +
        journeyOptions
          .filter(function (option) {
            return option.id !== state.id;
          })
          .map(function (option) {
            return (
              '<option value="' +
              esc(option.id) +
              '"' +
              (option.id === state.next_journey_id ? ' selected' : '') +
              '>' +
              esc(option.name) +
              '</option>'
            );
          })
          .join('') +
        '</select></label>' +
        '<label class="jb-header-field">On Exit' +
        '<select id="jbHeaderExitBehavior">' +
        '<option value="completed"' +
        (state.exit_behavior === 'completed' ? ' selected' : '') +
        '>Complete</option>' +
        '<option value="cancelled"' +
        (state.exit_behavior === 'cancelled' ? ' selected' : '') +
        '>Cancel</option></select></label>' +
        '<label class="jb-header-field jb-status-toggle">' +
        '<input type="checkbox" id="jbHeaderActive"' +
        (state.is_active ? ' checked' : '') +
        (state.status === 'archived' ? ' disabled' : '') +
        ' /> ' +
        (state.status === 'archived' ? 'Archived' : state.is_active ? 'Published' : 'Draft') +
        '</label>' +
        '</div>' +
        '<div class="jb-header-actions">' +
        '<span class="jb-dirty' +
        (state.dirty ? ' is-on' : '') +
        '">' +
        (state.dirty ? 'Unsaved' : 'Saved') +
        '</span>' +
        (state.id && state.status !== 'archived'
          ? '<button type="button" class="admin-btn-secondary" id="jbRunWorkflow">Test Workflow</button>'
          : '') +
        '<button type="button" class="admin-btn-secondary" id="jbSaveDraft">Save</button>' +
        '<button type="button" class="admin-btn-primary" id="jbPublish">Publish</button>' +
        '</div></header>' +
        '<div class="jb-workspace">' +
        '<div class="jb-canvas-wrap"><div class="jb-canvas" id="jbCanvas">' +
        canvasHtml +
        '</div></div>' +
        renderDrawer() +
        '</div>' +
        renderLeads() +
        renderAnalytics() +
        renderHistory() +
        '<p id="jbStatusMsg" class="admin-email-status" role="status"></p>' +
        '</div>';

      bind();
    }

    function setStatus(msg, ok) {
      var el = document.getElementById('jbStatusMsg');
      if (!el) return;
      el.textContent = msg || '';
      el.className =
        'admin-email-status ' + (ok ? 'admin-email-status-ok' : msg ? 'admin-email-status-err' : '');
    }

    function readHeader() {
      var nameEl = document.getElementById('jbHeaderName');
      var trigEl = document.getElementById('jbHeaderTrigger');
      var exitEl = document.getElementById('jbHeaderExitTrigger');
      var nextEl = document.getElementById('jbHeaderNextJourney');
      var behaviorEl = document.getElementById('jbHeaderExitBehavior');
      var actEl = document.getElementById('jbHeaderActive');
      if (nameEl) state.name = nameEl.value.trim();
      if (trigEl) state.trigger_type = trigEl.value;
      if (exitEl) state.exit_trigger = exitEl.value;
      if (nextEl) state.next_journey_id = nextEl.value;
      if (behaviorEl) state.exit_behavior = behaviorEl.value;
      if (actEl && state.status !== 'archived') {
        state.is_active = actEl.checked;
        state.status = actEl.checked ? 'published' : 'draft';
      }
      syncTriggerNode();
    }

    function saveJourney(publish) {
      readHeader();
      if (!state.name) {
        setStatus('Journey name is required.', false);
        return;
      }
      var steps = graphToSteps(state.nodes);
      if (!steps.length) {
        setStatus('Add at least one Wait or Email node.', false);
        return;
      }
      if (publish) {
        state.is_active = true;
        state.status = 'published';
      }
      var payload = {
        name: state.name,
        description: state.description,
        trigger_type: state.trigger_type,
        exit_trigger: state.exit_trigger || null,
        next_journey_id: state.next_journey_id || null,
        exit_behavior: state.exit_behavior,
        status: state.status,
        is_active: state.is_active,
        steps: steps
      };
      state.saving = true;
      setStatus('Saving…', true);
      var req = state.id
        ? fetch('/api/admin/journeys/' + encodeURIComponent(state.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        : fetch('/api/admin/journeys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

      req
        .then(function (res) {
          return res.json().then(function (body) {
            return { ok: res.ok, body: body };
          });
        })
        .then(function (result) {
          state.saving = false;
          if (!result.ok) {
            setStatus((result.body && result.body.error) || 'Save failed', false);
            return;
          }
          state.dirty = false;
          setStatus(publish ? 'Published.' : 'Saved.', true);
          var saved = result.body.journey;
          if (saved && saved.id) {
            if (!state.id) {
              window.location.hash = '#marketing/journeys/edit/' + saved.id;
              return;
            }
            state.id = saved.id;
            if (typeof options.onSaved === 'function') options.onSaved(saved);
            paint();
          }
        })
        .catch(function () {
          state.saving = false;
          setStatus('Save failed', false);
        });
    }

    function bind() {
      var nameEl = document.getElementById('jbHeaderName');
      if (nameEl) {
        nameEl.addEventListener('input', function () {
          state.dirty = true;
          document.querySelector('.jb-dirty').classList.add('is-on');
          document.querySelector('.jb-dirty').textContent = 'Unsaved';
        });
      }
      var trig = document.getElementById('jbHeaderTrigger');
      if (trig) {
        trig.addEventListener('change', function () {
          state.trigger_type = trig.value;
          state.dirty = true;
          syncTriggerNode();
          paint();
        });
      }
      [
        'jbHeaderExitTrigger',
        'jbHeaderNextJourney',
        'jbHeaderExitBehavior'
      ].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('change', function () {
          readHeader();
          state.dirty = true;
          var dirty = document.querySelector('.jb-dirty');
          if (dirty) {
            dirty.classList.add('is-on');
            dirty.textContent = 'Unsaved';
          }
        });
      });
      var act = document.getElementById('jbHeaderActive');
      if (act) {
        act.addEventListener('change', function () {
          state.is_active = act.checked;
          state.status = act.checked ? 'published' : 'draft';
          state.dirty = true;
          paint();
        });
      }

      document.getElementById('jbSaveDraft').addEventListener('click', function () {
        saveJourney(false);
      });
      var runWorkflow = document.getElementById('jbRunWorkflow');
      if (runWorkflow) {
        runWorkflow.addEventListener('click', function () {
          readHeader();
          if (typeof options.onRun === 'function') {
            options.onRun({ id: state.id, name: state.name || 'Workflow' });
          }
        });
      }
      document.getElementById('jbPublish').addEventListener('click', function () {
        saveJourney(true);
      });

      host.querySelectorAll('.jb-add-btn, .jb-add-tail').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var after = btn.getAttribute('data-after');
          state.addMenuAfter = state.addMenuAfter === after ? null : after;
          paint();
        });
      });

      host.querySelectorAll('.jb-add-menu-item').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var type = btn.getAttribute('data-type');
          var after = btn.closest('.jb-add-menu').getAttribute('data-after');
          insertAfter(after, type);
        });
      });

      host.querySelectorAll('.jb-node').forEach(function (card) {
        var id = card.getAttribute('data-node-id');
        card.addEventListener('click', function (e) {
          if (e.target.closest('.jb-node-btn')) return;
          openDrawer(id);
        });

        var edit = card.querySelector('.jb-edit');
        if (edit) {
          edit.addEventListener('click', function (e) {
            e.stopPropagation();
            openDrawer(id);
          });
        }
        var dup = card.querySelector('.jb-dup');
        if (dup) {
          dup.addEventListener('click', function (e) {
            e.stopPropagation();
            duplicateNode(id);
          });
        }
        var del = card.querySelector('.jb-del');
        if (del) {
          del.addEventListener('click', function (e) {
            e.stopPropagation();
            if (!window.confirm('Delete this node?')) return;
            deleteNode(id);
          });
        }
        var prev = card.querySelector('.jb-preview');
        if (prev) {
          prev.addEventListener('click', function (e) {
            e.stopPropagation();
            var node = findNode(id);
            if (!node || !node.data.template_id) return alert('Select a template first.');
            var match = null;
            for (var ti = 0; ti < templates.length; ti++) {
              if (templates[ti].key === node.data.template_id) {
                match = templates[ti];
                break;
              }
            }
            if (match && match.id) {
              fetch('/api/admin/journey-templates/' + encodeURIComponent(match.id) + '/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}'
              })
                .then(function (res) {
                  return res.json().then(function (body) {
                    return { ok: res.ok, body: body };
                  });
                })
                .then(function (r) {
                  if (!r.ok || !r.body.preview) return alert('Preview failed');
                  var w = window.open('', '_blank');
                  if (w) {
                    w.document.write(
                      '<title>' + esc(r.body.preview.subject) + '</title>' + r.body.preview.html
                    );
                  }
                });
              return;
            }
            window.location.hash = '#marketing/templates';
          });
        }
      });

      // Drag reorder
      var dragId = null;
      host.querySelectorAll('.jb-node[draggable="true"]').forEach(function (card) {
        card.addEventListener('dragstart', function (e) {
          dragId = card.getAttribute('data-node-id');
          card.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', function () {
          card.classList.remove('is-dragging');
          dragId = null;
        });
        card.addEventListener('dragover', function (e) {
          e.preventDefault();
          card.classList.add('is-drag-over');
        });
        card.addEventListener('dragleave', function () {
          card.classList.remove('is-drag-over');
        });
        card.addEventListener('drop', function (e) {
          e.preventDefault();
          card.classList.remove('is-drag-over');
          var dropId = card.getAttribute('data-node-id');
          if (!dragId || dragId === dropId) return;
          var order = orderedNodes();
          var from = -1;
          var to = -1;
          order.forEach(function (n, i) {
            if (n.id === dragId) from = i;
            if (n.id === dropId) to = i;
          });
          if (from < 0 || to < 0 || order[from].type === 'trigger') return;
          if (order[to].type === 'trigger') to = 1;
          var moved = order.splice(from, 1)[0];
          if (from < to) to -= 1;
          order.splice(to, 0, moved);
          // Ensure trigger stays first
          var trig = null;
          order = order.filter(function (n) {
            if (n.type === 'trigger') {
              trig = n;
              return false;
            }
            return true;
          });
          if (trig) order.unshift(trig);
          rebuildEdgesFromOrder(order);
          state.dirty = true;
          paint();
        });
      });

      var closeBtn = document.getElementById('jbDrawerClose');
      var cancelBtn = document.getElementById('jbDrawerCancel');
      if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
      if (cancelBtn) cancelBtn.addEventListener('click', closeDrawer);

      var saveDrawer = document.getElementById('jbDrawerSave');
      if (saveDrawer) {
        saveDrawer.addEventListener('click', function () {
          var node = findNode(state.selectedId);
          if (!node) return;
          if (node.type === 'trigger') {
            var t = document.getElementById('jbDrawerTrigger');
            if (t) {
              node.data.trigger_type = t.value;
              state.trigger_type = t.value;
            }
          } else if (node.type === 'wait') {
            var d = document.getElementById('jbDrawerDelay');
            var u = document.getElementById('jbDrawerUnit');
            if (d) node.data.delay_value = Math.max(0, Number(d.value) || 0);
            if (u) node.data.delay_unit = u.value;
          } else {
            var n = document.getElementById('jbDrawerName');
            if (n) node.data.step_name = n.value.trim() || nodeMeta(node.type).title;
            var tpl = document.getElementById('jbDrawerTemplate');
            if (tpl) node.data.template_id = tpl.value || null;
          }
          state.dirty = true;
          state.selectedId = null;
          paint();
        });
      }

      host.querySelectorAll('.jl-cancel').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.closest('[data-lj]').getAttribute('data-lj');
          if (!window.confirm('Cancel this lead journey?')) return;
          fetch('/api/admin/journey-leads/' + encodeURIComponent(id) + '/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}'
          }).then(function () {
            if (typeof options.onReload === 'function') options.onReload();
          });
        });
      });

      // Close add menu on outside click
      document.addEventListener(
        'click',
        function outside(ev) {
          if (!host.contains(ev.target)) return;
          if (ev.target.closest('.jb-add-btn, .jb-add-menu, .jb-add-tail')) return;
          if (state.addMenuAfter) {
            state.addMenuAfter = null;
            paint();
          }
        },
        { once: true }
      );
    }

    paint();

    return {
      getGraph: function () {
        return { nodes: state.nodes, edges: state.edges };
      },
      getSteps: function () {
        return graphToSteps(state.nodes);
      }
    };
  }

  global.JourneyBuilder = {
    mount: mount,
    stepsToGraph: stepsToGraph,
    graphToSteps: graphToSteps,
    ADDABLE_TYPES: ADDABLE_TYPES
  };
})(window);
