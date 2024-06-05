// app.js
$(function() {
    const Grade = Backbone.Model.extend({
        defaults: {
            grade: '',
            minPoints: 0,
            maxPoints: 100,
        }
    });

    const Grades = Backbone.Collection.extend({
        model: Grade
    });

    const GradeView = Backbone.View.extend({
        tagName: 'tr',
        template: _.template('<td><%= minPoints %> - <%= maxPoints %></td><td><%= grade %></td>'),
        render: function() {
            this.$el.html(this.template(this.model.toJSON()));
            return this;
        }
    });

    const GradesView = Backbone.View.extend({
        el: '#grading-scale',
        initialize: function() {
            const params = new URLSearchParams(window.location.hash.substr(1));
            const maxPoints = parseFloat(params.get('max')) || 100;
            const smaxPoints = parseFloat(params.get('smax')) || maxPoints;

            const extraPoints = Math.max(smaxPoints - maxPoints, 0);
			
			const gradeLabels = [
				"Sehr gut",    // 1
				"Gut",         // 2
				"Befriedigend",// 3
				"Ausreichend", // 4
				"Mangelhaft",  // 5
				"Ungenügend"   // 6
			]

            this.collection = new Grades([
                { grade: gradeLabels[0], minPoints: Math.round(92 / 100 * maxPoints), maxPoints: maxPoints + extraPoints },
                { grade: gradeLabels[1], minPoints: Math.round(81 / 100 * maxPoints), maxPoints: Math.round(92 / 100 * maxPoints) - 0.1 },
                { grade: gradeLabels[2], minPoints: Math.round(67 / 100 * maxPoints), maxPoints: Math.round(81 / 100 * maxPoints) - 0.1 },
                { grade: gradeLabels[3], minPoints: Math.round(50 / 100 * maxPoints), maxPoints: Math.round(67 / 100 * maxPoints) - 0.1 },
                { grade: gradeLabels[4], minPoints: Math.round(30 / 100 * maxPoints), maxPoints: Math.round(50 / 100 * maxPoints) - 0.1 },
                { grade: gradeLabels[5], minPoints: 0, maxPoints: Math.round(30 / 100 * maxPoints) - 0.1 }
            ]);

            if (extraPoints > 0) {
                this.collection.each(function(grade) {
                    if (grade.get('grade') === 'sehr gut') {
                        grade.set('maxPoints', grade.get('maxPoints') + extraPoints);
                    }
                });
            }

            this.render();
        },
        render: function() {
            const self = this;
            this.collection.each(function(grade) {
                const gradeView = new GradeView({ model: grade });
                self.$el.append(gradeView.render().el);
            });
            this.highlightRow();
        },
        highlightRow: function() {
            const params = new URLSearchParams(window.location.hash.substr(1));
            const points = parseFloat(params.get('p'));
            
			const gradeLabels = [
				"Sehr gut",    // 1
				"Gut",         // 2
				"Befriedigend",// 3
				"Ausreichend", // 4
				"Mangelhaft",  // 5
				"Ungenügend"   // 6
			];
			
            if (isNaN(points)) {
                return;
            }

            const grade = this.collection.find(function(model) {
                return points >= model.get('minPoints') && points <= model.get('maxPoints');
            });

            if (grade) {
                const gradeElement = this.$el.find('tr').eq(this.collection.indexOf(grade));
                gradeElement.addClass('table-info');
                $('#result').html(`Erreichte Note: ${gradeLabels.indexOf(grade.get('grade')) + 1} (${grade.get('grade').toLowerCase()}) mit ${points} Punkten`
				).addClass('alert-info').show();
            }
        }
    });

    new GradesView();
});
