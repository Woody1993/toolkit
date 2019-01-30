/**
 * Version: 2.0
 * Author: Woody
 * Description: 功能大纲：
 * 				1.创建时可省略new操作符 √
 * 				2.重构表格布局逻辑 √
 * 				3.优化滚动联动交互 √
 * 				4.优化自适应方法 √
 * 				5.优化表格行操作方法 ...
 * 					└ 插入行  insertRows √
 * 					└ 获取所有行  getAllRows，根据序号获得行  getRows、获得当前页选中行  getCrtRows
 * 						└ 移动至指定位置  moveTo
 * 						└ 删除  remove √
 * 						└ 获取数据  getData √
 * 						└ 选中  select √
 * 						└ 取消选中  unselect √
 * 						└ 刷新数据 update
 * 				6.优化排序方法 ...
 * 				7.优化汇总行 ...
 * 				8.优化分页栏 ...
 * 				9.增加系统列概念（隐藏列，序号列，复选列，分级列等）
 * 				10.支持多级子行
 * 				11.列宽拖拽调整
 * 				12.整列隐藏
 * 				13.整列拖拽排序
 * 				14.保存表格已选行，并在表格刷新（搜索、跳页等情况）时回填已选状态，提供方法
 * 					└ 获取已选数据  getCrtData
 * 					└ 清除已选数据  cleanCrtData
 * Date: 2018-11-01
**/

;(function(w, d, $) {
	var _rowHeight = 36; //行高，用于表格自动高度

	var _countBar = {}; //是否有汇总

	var _countData = {}; //表格汇总数据

	var _scrollSize = 0; //浏览器滚动条大小

	var _sortBy = {}; //表格目前的排序

	var _eventType = ['click', 'focus', 'blur', 'change']; //支持的文本框事件

	var _sysColName = ['__data', '__$tr', '__index', '__checkbox', '__selected']; //系统列集合

	$(function() {
		_scrollSize = (function() {
			var noScroll, scroll, oDiv = document.createElement('div');
			oDiv.style.cssText = 'position:absolute; top:-1000px; width:100px; height:100px; overflow:hidden;';
			noScroll = document.body.appendChild(oDiv).clientWidth;
			oDiv.style.overflowY = 'scroll';
			scroll = oDiv.clientWidth;
			document.body.removeChild(oDiv);
			return (noScroll - scroll);
		})()
	});

	var jsonExtend = function(de, json) {
		for (var i in json) {
			de[i] = json[i]
		}
		return de
	};

	var getData = function(grid, page, fun) {
		var param = {};
		var opt = grid.opt;
		var sortBy = _sortBy[grid.id];
		var data;
		page = page ? page : 1;
		param = typeof opt.data == 'function' ? opt.data() : opt.data;
		param.pageIndex = page;
		param.pageSize = opt.pageSize;
		if (sortBy) {
			sortBy = sortBy.split(',');
			param.sort = sortBy[0];
			param.sortBy = sortBy[1]
		}
		$.ajax({
			url: opt.url + '?t=' + (new Date()).getTime(),
			type: opt.method,
			data: param,
			dataType: opt.dataType,
			success: function(msg) {
				if (typeof msg == 'string') {
					msg = (new Function("return " + msg))();
				}
				if (opt.countDataFormatter) {
					_countData[grid.id] = opt.countDataFormatter(msg)
				}
				grid.rowsCount = opt.rowsCountFormatter(msg);
				data = opt.dataFormatter(msg);
				for (var i in data) {
					data[i]['__index'] = parseInt(i)+1;
				}
				fun(data);
			}
		});
	};

	var getColGroup = function(grid) {
		var opt = grid.opt;
		var json = {
			main: [],
			left: [],
			right: []
		};

		if (opt.selectModel > 0) {
			if (opt.selectAll && opt.selectModel == 2) {
				var $allChk = $('<input type="checkbox" class="d-grid-chk-all" />')
			} else {
				var $allChk = ''
			};
			if (opt.callSelectModel != 1) {
				opt.colModel.unshift({
					width: 35,
					title: $allChk,
					name: '__checkbox',
					frozen: 'left',
					align: 'center',
					dataFormatter: function() {
						return $('<input type="checkbox" class="d-grid-chk" />');
					}
				})
			}
		};

		var cols = opt.colModel;
		var sifter = function(cols, frozen) {
			var width = 0;
			for (var i in cols) {
				if (!cols[i]) continue;
				if (cols[i].subCol) {
					cols[i] = jsonExtend({
						title: '',
						align: 'center',
						frozen: 'none'
					}, cols[i]);
					cols[i].width = sifter(cols[i].subCol, cols[i].frozen);
				} else {
					if (cols[i].sys == 'index') {
						cols[i].name = '__index';
					}
					cols[i] = jsonExtend({
						title: '',
						name: '',
						width: 100,
						frozen: 'none',
						sortBy: 'none',
						sortParam: '',
						align: 'left',
						editable: false,
						iptClassName: '',
						overflow: true,
						dataFormatter: function(value, row) {
							return value
						},
						titleFormatter: function(value, row) {
							return value
						},
						count: false,
						countFormatter: function(count) {
							return count
						}
					}, cols[i]);
					if (frozen) cols[i].frozen = frozen;
					if (cols[i].count == true) {
						_countBar[grid.id] = true;
						cols[i].count = function(value, row) {
							return parseFloat(value);
						}
					} else if (typeof cols[i].count == 'function') {
						_countBar[grid.id] = true
					}
					cols[i].width = (parseInt(cols[i].width) || 100) + 14 + 'px';
					json[cols[i].frozen == 'none' ? 'main' : cols[i].frozen].push(cols[i]);
				}
				width += parseInt(cols[i].width) + 1;
			}
			return width - 1 + 'px';
		};
		sifter(cols);
		return json
	};

	var initFrame = function(grid) {
		var opt = grid.opt;

		grid.root = {
			dom: $('<div class="d-grid"></div>')
		};
		grid.root.head = {
			dom: $('<div class="d-grid-head"></div>').appendTo(grid.root.dom)
		};
		grid.root.head.left = {
			dom: $('<div class="d-froze-left"></div>').appendTo(grid.root.head.dom)
		};
		grid.root.head.right = {
			dom: $('<div class="d-froze-right"></div>').appendTo(grid.root.head.dom)
		};
		grid.root.head.main = {
			dom: $('<div class="d-main"></div>').appendTo(grid.root.head.dom)
		};
		grid.root.body = {
			dom: $('<div class="d-grid-body"></div>').appendTo(grid.root.dom)
		};
		grid.root.body.left = {
			dom: $('<div class="d-froze-left"></div>').appendTo(grid.root.body.dom)
		};
		grid.root.body.right = {
			dom: $('<div class="d-froze-right"></div>').appendTo(grid.root.body.dom)
		};
		grid.root.body.main = {
			dom: $('<div class="d-main"></div>').appendTo(grid.root.body.dom)
		};

		if (_countBar[grid.id]) {
			grid.root.foot = {
				dom: $('<div class="d-grid-foot"></div>').appendTo(grid.root.dom)
			};
			grid.root.foot.left = {
				dom: $('<div class="d-froze-left"></div>').appendTo(grid.root.foot.dom).append('<table><tbody></tbody></table>')
			};
			grid.root.foot.right = {
				dom: $('<div class="d-froze-right"></div>').appendTo(grid.root.foot.dom).append('<table><tbody></tbody></table>')
			};
			grid.root.foot.main = {
				dom: $('<div class="d-main"></div>').appendTo(grid.root.foot.dom).append('<table><tbody></tbody></table>')
			};
		};

		if (opt.pageBar) {
			grid.root.page = {
				dom: $('<div class="d-grid-page"></div>').appendTo(grid.root.dom)
			};
		}

		var $headObjs = createThead(grid.opt.colModel, true);
		grid.root.head.main.dom.append($headObjs[0]);
		grid.root.head.left.dom.append($headObjs[1]);
		grid.root.head.right.dom.append($headObjs[2]);


		grid.root.body.main.dom.append('<table><tbody></tbody></table>');
		grid.root.body.left.dom.append('<table><tbody></tbody></table>');
		grid.root.body.right.dom.append('<table><tbody></tbody></table>');

		grid.box.html(grid.root.dom);
	};

	var createThead = function(cols, n) {
		var $hds = [$('<thead>'), $('<thead>'), $('<thead>')];

		//设置排序按钮
		var setSort = function($th, col) {
			if (col.sortBy == 'none') return $th;
			$th.addClass('d-grid-sort-th').data({
				sortType: col.sortBy == 'both' ? (col.sortInit == 'desc' ? 'desc,asc' : 'asc,desc') : col.sortBy,
				sortParam: col.sortParam ? col.sortParam : col.name,
				sortFrom: col.sortFrom,
				sortModel: col.sortModel
			}).append('<i class="df df-sort"></i><i class="df df-sort-desc"></i><i class="df df-sort-asc"></i>');
			return $th
		};

		//获取跨列数
		var getColspan = function(col) {
			var colspan = 0;
			if (col.subCol) {
				for (var i in col.subCol) {
					col.subCol[i].colspan = getColspan(col.subCol[i]);
					colspan += col.subCol[i].colspan
				}
			} else {
				colspan++
			}
			return colspan
		};
		for (var i in cols) {
			cols[i].colspan = getColspan(cols[i])
		};

		//获取json深度
		var getDepth = function(subCol) {
			var maxDepth = 1;
			for (var i in subCol) {
				subCol[i].depth = 1;
				if (subCol[i].subCol) {
					subCol[i].depth += getDepth(subCol[i].subCol)
				}
				maxDepth = maxDepth > subCol[i].depth ? maxDepth : subCol[i].depth
			}
			return maxDepth
		};
		getDepth(cols);

		var f = function(cols) {
			var $trs = [$('<tr>'), $('<tr>'), $('<tr>')];
			var subCol = [];
			var maxDepth = 0;
			for (var i in cols) {
				maxDepth = maxDepth > cols[i].depth ? maxDepth : cols[i].depth
			};
			for (var i = 0, len = cols.length; i < len; i++) {
				if (cols[i].subCol) {
					var $th = $('<th colspan="' + cols[i].colspan + '" rowspan="1"><div class="th" style="width:' + cols[i].width + ';height:35px;line-height:35px;text-align:' + cols[i].align + ';"></div></th>');
					$th.find('div').html(cols[i].title);
					for (var j in cols[i].subCol) {
						subCol.push(cols[i].subCol[j])
					}
				} else {
					var rowspan = maxDepth - cols[i].depth + 1;
					var $th = $('<th colspan="1" rowspan="' + (maxDepth - cols[i].depth + 1) + '"><div class="th" style="width:' + cols[i].width + ';height:' + (rowspan * 35 + rowspan - 1) + 'px;line-height:' + (rowspan * 35 + rowspan - 1) + 'px;text-align:' + cols[i].align + ';"></div></th>');
					setSort($th.find('div').html(cols[i].title), cols[i])
				};

				var frozen = cols[i].frozen;
				$trs[frozen == 'left' ? 1 : (frozen == 'right' ? 2 : 0)].append($th)
			};
			for (var i=0; i<3; i++) {
				if ($trs[i].find('th').length > 0) $hds[i].append($trs[i]);
			}
			if (subCol.length > 0) f(subCol)
		};
		f(cols);

		if (n) {
			return [
				$('<table>').html($hds[0]),
				$('<table>').html($hds[1]),
				$('<table>').html($hds[2])
			]
		} else {
			return [
				$('<div class="d-grid-hd">').html($('<table>').html($hds[0])),
				$('<div class="d-grid-hd">').html($('<table>').html($hds[1])),
				$('<div class="d-grid-hd">').html($('<table>').html($hds[2]))
			]
		}
	};

	var createRow = function(grid, cols, data) {
		var opt = grid.opt;
		var $tr = $('<tr>');
		var insertTd = function(col) {
			var name = col.name;
			var value = data[name];

			var $td = $('<td><div class="td" style="width:' + col.width + '; text-align:' + col.align + '">');

			if (col.editable) {
				var $ipt = $('<input class="d-grid-ipt" type="text" />').addClass(col.iptClassName);
				$td.children('div').html($ipt);
				for (var i in _eventType) {
					var eFun = col.editEvent[_eventType[i]];
					if (typeof eFun == 'function') {
						$ipt[_eventType[i]](eFun);
					}
				}
				$ipt.keyup(function() {
					data[name] = $(this).val();
				});
			};
			if (!col.overflow) {
				$td.find('div').addClass('z-hide-txt');
			}
			$tr.append($td);

			function setVal(v) {
				if (col.titleFormatter) {
					var title = col.titleFormatter(v, data);
					if (typeof title != 'string') title = '';
					$td.attr('title', title.replace(/<\/?[^>]*>/g, ''));
				}

				if (col.editable) {
					$td.children('div').children('input').val(col.dataFormatter(v, data));
				} else {
					$td.children('div').html(col.dataFormatter(v, data));
				};
			}

			// 如果使用了数据则进行双向绑定
			if (name) {
				Object.defineProperty(data, name, (function(v) {
					return {
						get: function() {
							return v;
						},
						
						set: function(nv) {
							v = nv;
							setVal(v);
						}
					}
				})(data[name]));
	
				data[name] = value == undefined ? '' : value;
			} else {
				setVal();
			}
		};
		for (var i = 0, len = cols.length; i < len; i++) {
			insertTd(cols[i]);
		};

		var rh = new rowsHandle(grid, [data]);
		$tr.click(function() {
			console.log(1);
			grid.opt.rowOnClick(rh.getData()[0]);
		});
		if (opt.selectModel != 0) {
			if (opt.callSelectModel == 0 || opt.callSelectModel == 2) {
				$tr.find('.d-grid-chk').click(function(e) {
					console.log(2);
					if (grid.opt.beforeSelect(rh.getData()[0]) === false) return;
					if ($tr.hasClass('z-crt')) {
						rh.unselect();
					} else {
						rh.select();
					}
					e.stopPropagation();
				});
			}
			if (opt.callSelectModel == 1 || opt.callSelectModel == 2) {
				$tr.click(function() {
					console.log(3);
					if (grid.opt.beforeSelect(rh.getData()[0]) === false) return;
					if ($(this).hasClass('z-crt')) {
						rh.unselect();
					} else {
						rh.select();
					}
				});
			}
		};

		$tr.find('.d-grid-ipt').click(function(e) {
			e.stopPropagation();
		});

		if (!data['__$tr']) data['__$tr'] = [];
		data['__$tr'].push($tr[0]);
		$tr.mouseenter(function() {
			$(data['__$tr']).addClass('z-hover');
		}).mouseleave(function() {
			$(data['__$tr']).removeClass('z-hover');
		});
		return $tr;
	};

	var createCount = function(id, cols, data) {
		var $tr = $('<tr>');
		var insertTd = function(col) {
			var name = col.name;
			var count = '';
			var $td = $('<td><div class="td" style="width:' + col.width + '">');
			if (typeof col.count == 'function') {
				count = (function(name) {
					var count = 0;
					for (var j in data) {
						count += col.count(col.dataFormatter(data[j][name], data[j]), data[j], j)
					}
					return count
				})(name)
			}
			$td.find('div').html(col.countFormatter(count, _countData[id]));
			$tr.append($td)
		};
		for (var i = 0, len = cols.length; i < len; i++) {
			insertTd(cols[i])
		}
		var $table = $('<table><tbody></tbody></table>');
		$table.find('tbody').html($tr);
		return $table;
	};

	var createPage = function(page, pageSize, rowCount) {
		page = page ? page : 1;
		var pageCount = Math.ceil(rowCount / pageSize);
		pageCount = pageCount ? pageCount : 1;
		var l = (page - 1) * pageSize + 1;
		var r = page * pageSize > rowCount ? rowCount : page * pageSize;
		var html = ['<a href="javascript:" class="page-first ' + (page == 1 ? 'z-dis' : '') + '"><i class="df df-tri-left ' + (page == 1 ? '' : 'z-live') + '"></i></a>', '<a href="javascript:" class="page-prev ' + (page == 1 ? 'z-dis' : '') + '"><i class="df df-tri-left ' + (page == 1 ? '' : 'z-live') + '"></i></a>', '<span>第<form><input type="text" value="' + page + '" maxnum="' + pageCount + '"></form>页 共' + pageCount + '页</span>', '<a href="javascript:" class="page-next ' + (page == pageCount ? 'z-dis' : '') + '"><i class="df df-tri-right ' + (page == pageCount ? '' : 'z-live') + '"></i></a>', '<a href="javascript:" class="page-last ' + (page == pageCount ? 'z-dis' : '') + '"><i class="df df-tri-right ' + (page == pageCount ? '' : 'z-live') + '"></i></a>', '<a href="javascript:" class="page-update"><i class="df df-refresh"></i></a>', '<p>显示 ' + (rowCount ? l : 0) + ' - ' + r + '，共' + rowCount + '条</p>', ];
		return html.join('')
	};

	var initRowHeight = function(grid) {
		var $centerTr = grid.root.body.main.dom.find('tr');
		var $leftTr = grid.root.body.left.dom.find('tr');
		var $rightTr = grid.root.body.right.dom.find('tr');
		for (var i = 0, len = $centerTr.length; i < len; i++) {
			var hl = $leftTr.eq(i).height();
			var hr = $rightTr.eq(i).height();
			var h = $centerTr.eq(i).height();
			h = h < (hl < hr ? hr : hl) ? (hl < hr ? hr : hl) : h;
			$leftTr.eq(i).height(h);
			$rightTr.eq(i).height(h);
			$centerTr.eq(i).height(h)
		}

		var $centerTr = grid.root.foot.main.dom.find('tr');
		var $leftTr = grid.root.foot.left.dom.find('tr');
		var $rightTr = grid.root.foot.right.dom.find('tr');
		var hl = $leftTr.height();
		var hr = $rightTr.height();
		var h = $centerTr.height();
		h = h < (hl < hr ? hr : hl) ? (hl < hr ? hr : hl) : h;
		$leftTr.height(h);
		$rightTr.height(h);
		$centerTr.height(h)

		grid.resize()
	};

	var updateRowIndex = function(grid) {
		for (var i in grid.data) {
			grid.data[i].__index = parseInt(i) + 1;
		}
	};

	var synchronizeScroll = function(grid) {
		grid.root.body.main.dom.scroll(function() {
			grid.root.head.main.dom.find('table').css('left', -$(this).scrollLeft());
			grid.root.foot.main.dom.find('table').css('left', -$(this).scrollLeft());
			grid.root.body.left.dom.find('table').css('top', -$(this).scrollTop());
			grid.root.body.right.dom.find('table').css('top', -$(this).scrollTop());
		});

		grid.root.body.left.dom.on('mousewheel DOMMouseScroll', onMouseScroll);
		grid.root.body.right.dom.on('mousewheel DOMMouseScroll', onMouseScroll);
		function onMouseScroll(e) {
			var wheel = e.originalEvent.wheelDelta || -e.originalEvent.detail;
			var delta = Math.max(-1, Math.min(1, wheel));
			var n = grid.root.body.main.dom.scrollTop();

			grid.root.body.main.dom.scrollTop(n - delta * 30);
			e.preventDefault();
		}
	};

	var bindEvent = function(grid) {
		var $box = grid.box;
		grid.root.head.left.dom.find('.d-grid-chk-all').click(function() {
			if ($(this).attr('checked')) {
				grid.selectRows('all')
			} else {
				grid.unselectRows('all')
			}
		});
		$box.find('.d-grid-sort-th').click(function() {
			var sortType = $(this).data('sortType').split(',');
			var sortParam = $(this).data('sortParam');
			if ($(this).hasClass('z-sort-desc')) {
				if (sortType.indexOf('asc') > -1) {
					$box.find('.d-grid-sort-th').removeClass('z-sort-desc z-sort-asc');
					$(this).removeClass('z-sort-desc').addClass('z-sort-asc');
					_sortBy[grid.id] = sortParam + ',asc'
				}
			} else if ($(this).hasClass('z-sort-asc')) {
				if (sortType.indexOf('desc') > -1) {
					$box.find('.d-grid-sort-th').removeClass('z-sort-desc z-sort-asc');
					$(this).removeClass('z-sort-asc').addClass('z-sort-desc');
					_sortBy[grid.id] = sortParam + ',desc'
				}
			} else {
				$box.find('.d-grid-sort-th').removeClass('z-sort-desc z-sort-asc');
				$(this).addClass('z-sort-' + sortType[0]);
				_sortBy[grid.id] = sortParam + ',' + sortType[0]
			}
			grid.update(1)
		});
	};
	
	var main = function(opt) {
		return new main.fn.init(opt);
	};

	main.fn = main.prototype = {
		init: function(opt) {
			opt = jsonExtend({
				box: 'body',
				dataFrom: 'ajax',
				url: '',
				method: 'POST',
				data: {},
				pageSize: 20,
				dataType: 'json',
				dataFormatter: function(data) {
					return data.data
				},
				countDataFormatter: false,
				rowsCountFormatter: function(data) {
					return data.total
				},
				width: '100%',
				height: 'auto',
				indexColWidth: 35,
				indexFormatter: false,
				selectModel: 0,  // 0：不支持选择；1：支持单选；2：支持多选
				callSelectModel: 0,  // 0: 通过点击复选框；1：通过点击行；2：通过点击复选框或点击行
				selectAll: false,  // 是否支持全选
				colModel: [],
				pageBar: true,
				rowOnClick: function() {},
				beforeSelect: function() {},
				rowOnSelect: function() {}
			}, opt || {});
			this.opt = opt;
			this.box = $(opt.box + ':first');
			if (this.box.length == 0) return this;
			this.rowsCount = 0;
			this.width = opt.width;
			this.height = opt.height;
			this.colsModel = getColGroup(this);
			initFrame(this);
			synchronizeScroll(this);
			bindEvent(this);
			this.resize();
			this.update(1);
			return this
		},

		update: function(page) {
			var me = this;
			var opt = this.opt;
			var maxnum = me.pageCount || 1;
			page = page || parseInt(me.nowPage);
			page = page > maxnum ? maxnum : page;
			me.nowPage = page;
			this.data = [];
			this.root.body.main.dom.find('tbody').html('');
			this.root.body.left.dom.find('tbody').html('');
			this.root.body.right.dom.find('tbody').html('');

			var create = function (data) {
				me.pushRows(data);
				if (_countBar[me.id]) {
	
					this.root.foot.main.dom.html(createCount(me.id, this.colsModel.main, data));
					this.root.foot.left.dom.html(createCount(me.id, this.colsModel.left, data));
					this.root.foot.right.dom.html(createCount(me.id, this.colsModel.right, data));
					initRowHeight(me)
				};
				if (opt.pageBar) {
					this.root.page.dom.html(createPage(page, opt.pageSize, me.rowsCount));
					me.pageCount = this.root.page.dom.find('input').attr('maxnum');
					this.root.page.dom.find('a').click(function() {
						if ($(this).hasClass('z-dis')) return;
						if ($(this).hasClass('page-update')) {
							me.update();
							return
						};
						var page = me.root.page.dom.find('input').val();
						if ($(this).hasClass('page-first')) {
							page = 1
						} else if ($(this).hasClass('page-prev')) {
							page = --page
						} else if ($(this).hasClass('page-next')) {
							page = ++page
						} else if ($(this).hasClass('page-last')) {
							page = me.root.page.dom.find('input').attr('maxnum')
						}
						me.update(parseInt(page))
					});
					this.root.page.dom.find('form').submit(function() {
						var $ipt = me.root.page.dom.find('input');
						var maxnum = $ipt.attr('maxnum');
						var page = parseInt($ipt.val()) || 1;
						page = page > maxnum ? maxnum : page;
						me.update(parseInt(page));
						return false
					});
					this.root.page.dom.find('input').focus(function() {
						$(this).select()
					}).blur(function() {
						$(this).val(me.nowPage)
					})
				};
	
				if ((typeof this.height == 'function' ? this.height() : this.height) == 'auto') {
					this.resize();
				}
			}.bind(this);

			if (opt.dataFrom == 'ajax') {
				getData(me, page, create);
			} else if (opt.dataFrom == 'local') {
				create(opt.data);
			}
			return this;
		},

		resize: function() {
			var opt = this.opt;
			var $box = this.box;
			var width = this.width.indexOf('%') >= 0 ? $box.width() * (parseFloat(this.width) || 0) / 100 : width;
			var height =  typeof this.height == 'function' ? this.height() : this.height;

			this.root.dom.width(width - 2);

			var sw = sh = 0;
			if (height == 'auto') {
				var h = this.data.length * _rowHeight + (sh ? sh : 0);
				this.root.dom.height('auto');

				if (this.root.body.main.dom.find('table').innerWidth() > this.root.body.main.dom.width()) {
					sh = _scrollSize;
				}

				this.root.body.main.dom.height(h + sh);
			} else {
				var h = height - this.root.head.dom.height() - 2 - (_countBar[this.id] ? this.root.foot.dom.height() : 0) - (opt.pageBar ? 41 : 0);
				this.root.dom.height(height - 2);
				this.root.body.main.dom.height(h);

				if (this.root.body.main.dom.find('table').height() > this.root.body.main.dom.height()) {
					sw = _scrollSize;
				}

				if (this.root.body.main.dom.find('table').innerWidth() + sw > this.root.body.main.dom.width()) {
					sh = _scrollSize;

					if (this.root.body.main.dom.find('table').height() + sh > this.root.body.main.dom.height()) {
						sw = _scrollSize;
					}
				}
				this.root.body.left.dom.height(h - sh);
				this.root.body.right.dom.height(h - sh);
			}
			this.root.head.right.dom.css('padding-right', sw);
			this.root.body.right.dom.css('right', sw);
			this.root.foot.right.dom.css('padding-right', sw);
			this.root.head.main.dom.css({
				'padding-left': this.root.head.left.dom.width(),
				'padding-right': this.root.head.right.dom.width() - 1 + sw
			});
			this.root.body.main.dom.find('table').css({
				'padding-left': this.root.body.left.dom.width(),
				'padding-right': this.root.body.right.dom.width() - 1
			});
			this.root.foot.main.dom.css({
				'padding-left': this.root.body.left.dom.width(),
				'padding-right': this.root.body.right.dom.width() - 1 + sw
			});
			return this;
		},

		pushRows: function(data) {
			this.insertRows(0, data);
			return this;
		},

		unshiftRows: function(data) {
			this.insertRows(0, data);
			return this;
		},

		insertRows: function(index, data) {
			var me = this;
			var total = this.data.length;
			if (index >= total) index = -1;
			else if (index < -total) index = 0;
			if (total == 0 || index == -1) {
				var fun = function(data) {
					this.data.push(data);
					this.root.body.main.dom.find('tbody').append(createRow(this, this.colsModel.main, data));
					this.root.body.left.dom.find('tbody').append(createRow(this, this.colsModel.left, data));
					this.root.body.right.dom.find('tbody').append(createRow(this, this.colsModel.right, data));
				}.bind(this);
			} else {
				var $trs = this.data[index].__$tr;
				var fun = function(data) {
					this.data.splice(index++, 0, data);
					$($trs[0]).before(createRow(this, this.colsModel.main, data));
					$($trs[1]).before(createRow(this, this.colsModel.left, data));
					$($trs[2]).before(createRow(this, this.colsModel.right, data));
				}.bind(this);
			};
			for (var i = 0, len = data.length; i < len; i++) {
				fun(data[i])
			}
			updateRowIndex(me);
			initRowHeight(me);

			var $imgs = this.root.body.dom.find('img');
			if ($imgs.length > 0) {
				$imgs.load(function() {
					initRowHeight(me);
				})
			}
			return this;
		},
		
		/**
		 * 根据序号获取行对象
		 * @param {number|string|array} index 序号或序号数组
		 * @return {object}
		 */
		getRows: function(index) {
			if (is(index) == 'number' || is(index) == 'string') index = [index];
			else if(is(index) != 'array') return;

			var a = [];
			for (var i in index) {
				var n = index[i];
				if (n < 0 || n >= this.data.length) continue;
				a.push(this.data[n]);
			}

			return new rowsHandle(this, a);
		},

		resizeWidth: function(w) {
			this.width = w;
			this.resize();
			return this;
		},

		resizeHeight: function(h) {
			this.height = h;
			this.resize();
			return this;
		},

		setData: function(data) {
			var opt = this.opt;
			if (opt.dataFrom == 'local') {
				opt.data = data;
				this.update(1);
			}
			return this;
		}
	};

	main.fn.init.prototype = main.fn;

	w.dGrid = w.d = main;
	
	/**
	 * 行操作构造函数
	 * @param {object}  grid 
	 * @param {array}   data 
	 * @return {object}
	 */
	var rowsHandle = function(grid, data) {
		this.grid = grid;
		this.rows = data;
		
		for (var i in this.rows) {
			var json = {};
			for (var j in this.rows[i]) {
				var t = this.rows[i][j];
				if (_sysColName.indexOf(j) == -1) {
					json[j] = t;
				}
			}
			this.rows[i].__data = json;
		}
		return this;
	};

	rowsHandle.prototype = {
		moveTo: function() {

		},

		remove: function() {
			for (var i in this.rows) {
				$(this.rows[i].__$tr).remove();
				this.grid.data.splice(this.rows[i].__index-1, 1);
			}
			updateRowIndex(this.grid);
			return this;
		},

		getData: function() {
			var data = [];
			for (var i in this.rows) {
				data.push(this.rows[i].__data);
			}
			return data;
		},

		select: function() {
			for (var i in this.rows) {
				var row = this.rows[i];
				if ($(row.__$tr).hasClass('z-crt')) continue;
				$(row.__$tr).addClass('z-crt').find('.d-grid-chk').attr('checked', 'true');
				row.__selected = true;

				this.grid.opt.rowOnSelect(row.__data);
			}
		},

		unselect: function() {
			for (var i in this.rows) {
				var row = this.rows[i];
				if (!$(row.__$tr).hasClass('z-crt')) continue;
				$(row.__$tr).removeClass('z-crt').find('.d-grid-chk').removeAttr('checked');
				row.__selected = false;
			}
		},

		update: function() {

		}
	};

})(window, document, window.jQuery);